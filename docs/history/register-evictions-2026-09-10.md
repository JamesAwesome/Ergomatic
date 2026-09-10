# Register evictions — 2026-09-10

Seventeen rows that had finished and were still sitting in the live slate.
Moved here, not deleted: every one is findable at this address, under the
section it came from.

Each was read in full before it moved. Three more rows the same sweep found
did NOT come here — they are decisions to live with something rather than
finished work, and went to `## Accepted, pinned, and not being fixed` instead:
Today's last three rows carrying no PARTIAL chip (which defers a third option
to the Timer-mode design pass), the same-titled-workout deletion unmarking a
plan row ("revisit only if a rower actually hits it"), and the `id DESC`
tiebreak staying unpinned as low-value.


## From `## Codebase-audit owners`

- [x] **LOST THE MONITOR must not say "Nothing kept." — DONE in door PR B**
  (2026-09-03). Shipped on all THREE surfaces that carried the phrase, not
  one: the banner's `kept === 0` arm renders its title alone (no body
  element at all, never an emptied one), the connected surface's ended frame
  says "The erg dropped the workout." and stops, and `LogSession.tsx`'s
  dropped strip says "You had not finished an interval yet." with the bold
  clause dropped rather than emptied. Every `kept >= 1` arm is byte-for-byte
  unchanged. **The sentence below is WRONG and is corrected here rather than
  deleted, because it was the reason this rode PR B:** a part-rowed interval
  does NOT count toward "kept" and never will — I-B2, a partial is never an
  `IntervalActual` and `measuredIntervalCount` does not see it. What PR B
  actually does is make the zero-kept case one where something IS on screen
  (the interval's own metres), which is why the phrase had to go. The
  original text, for the record:
  > **LOST THE MONITOR must not say "Nothing kept."** (James, 2026-09-02):
  > on the connected lost-link banner (`ConnectedSurface.tsx`'s
  > `LostBanner`, the `kept === 0` arm), that line reads as loss at the
  > exact moment the RECONNECT is nullifying it — scary and, given
  > recovery, false. Proposed: `kept === 0` renders the title alone (no
  > body); `kept >= 1` keeps "N intervals kept." Copy-only, one file,
  > cosmetic failure mode — FAST-PATH eligible, but a rendered **Gate 0**
  > first (it changes what a rower reads). **Rides PR 4 (§5 partial
  > metres) — James, 2026-09-02**: the same PR that makes a part-rowed
  > interval count toward "kept" owns what the zero-kept banner says, one
  > Gate 0 for the whole kept vocabulary. Evidence:
  > `ConnectedSurface.tsx:848`.

- **STRUCK 2026-09-09 (Phase OD): the DIAGNOSTICS door's affordance sentence
  SHIPPED.** `app/src/news/content/releaseNotes.ts:476` carries it verbatim —
  where it is (You, then DIAGNOSTICS, then Monitor logs), WHEN a rower would
  tap it (a connected session went wrong and someone asks for the log), and
  what COPY does. **THE STRIKE CARRIES A CORRECTION, and without it the next
  reader reopens this row: it landed in `v0.33.0`, not the `v0.32.0` this row
  named.** The version block above line 476 is `version: "v0.33.0"` (line
  473). Anyone greping the v0.32.0 notes for the sentence finds nothing and
  concludes it is still owed. Originally filed at the PM gate on #258,
  2026-09-01.

- **The store's first copied-ring check — DISCHARGED 2026-09-04.** #239's
  PM gate required the next supplied ring to be decoded for
  `commit-accepted{verdict:"failed"}`. Both v0.36.1 walk rings were decoded:
  all 11 commit receipts say `saved` (Lock revisions 0–4, Drop 0–5), none
  `failed`. `storage-persist: denied` is not a failed write. This checks the
  supplied evidence, not the incidence of rejected writes; any future failed
  receipt still warrants investigation. Evidence:
  [walk record and complete rings](docs/monitor/sessions/walk-2026-09-04-wave-f/README.md).

- **The machine-summary FIELD PROOF — DISCHARGED 2026-08-31.** Lifted here
  when Wave F's machine-totals item was struck: every gate behind that fix
  was the app agreeing with the app (RF11), and it was proven only when a
  row saved on James's phone from v0.27.0 or later came back
  machine-confirmed. **It did — the first machine-confirmed row in prod.**
  James rowed 5x750m/1:30r on 2026-08-31 and photographed the PM5's own
  View Detail beside the phone: the PM5 reads `15:49.0 · 3750m ·
  Verification 050E-273C 1B69-9691`; the app's Log renders
  `MACHINE CONFIRMED · WORK ONLY · 15:49.0 work · 3750m · CODE 050E-273C
  1B69-9691`. Per-interval paces agree to the tenth on every row the PM5
  screen showed (2:08.8 / 2:07.7 / 2:06.6 / 2:05.3) and the interval times
  agree to the second (3:13.3→3:13, 3:11.6→3:12, 3:10.0→3:10, 3:08.0→3:08).
  This is RF11's real oracle, not a mirror: the code is minted by the
  monitor and the app cannot compute it. The prod re-count is now a
  formality (it was the proxy for exactly this photograph); run it at the
  next DB touch and expect ≥1 of N. Which build produced the row is
  INFERENCE — `ios:release` for v0.30.0 ran earlier the same day, but the
  screenshot carries no build stamp; the code alone proves ≥ v0.27.0.
  Evidence: the two 2026-08-31 photographs (PM5 View Detail + Log detail,
  in James's session), the 2026-08-30 count (0 of 18) as the baseline it
  moved from.

- **RESOLVED (James, 2026-08-31: "Gold approved" on the rendered
  `log-monitor-dropped.png` / `log-monitor-dropped-landscape.png` captures
  at `9bd4ddac`)** — the completion-eyebrow suppression recommended at
  PR #248's round-1 review ("My recommendation is to suppress the
  completion eyebrow") is Gate-0 approved: the dropped-arrival log screen
  no longer reads `WORKOUT COMPLETE` two lines above `THE ERG DROPPED THE
  WORKOUT.` Scoped across all THREE arrival types that did not complete,
  never a drop-only fork (`.summary-eyebrow` suppresses on
  `endedBy === "program-dropped" | "link-lost" | "interrupted"`,
  `SummaryModel.suppressCompletionEyebrow`), unchanged everywhere else.
  The controller's ruling stands approved with it: the composed-route
  evidence (portrait + landscape, real LogSession → PostWorkoutSummary
  composition) covers the dropped arrival only; link-lost and interrupted
  share the identical derivation and renderer, so no routed captures are
  owed for those two unless James asks for them.


## From `## Needs a decision from James`

- **RULED KEEP (James, 2026-09-09): the 1 000 ms collision window stays.**
  `TARGET_COLLISION_WINDOW_MS` (`src/monitor/transports/capacitorBle.ts`) holds
  every targeted scan open for a full second after the first exact-name match,
  so two devices carrying one name fail closed instead of programming the wrong
  erg. The walk measured 2-3 s to CONNECTED; a third of that is ours.
  **THE ROW'S OWN PREMISE WAS WRONG, and that is the part worth keeping.** It
  asked "whether a household of ONE erg should pay a gym's safety margin".
  Asked directly, James rows REGULARLY AROUND SEVERAL ERGS — so the wrong-erg
  accident is reachable in his actual environment, not a gym's hypothetical —
  and he does not notice the second. A cost nobody pays against a risk that is
  live buys nothing by being shortened.
  **Consequence for the next reader: whether two PM5s can genuinely advertise
  one name is NO LONGER LOAD-BEARING.** Keeping the window is correct under
  either answer, so do not spend a research pass on it. Filed at Phase NF's
  close 2026-09-06; ruled 2026-09-09 in the Phase OD order sweep.

- **RULED KEEP (James, 2026-09-09): the `PM5` / `Timer` provenance label
  stays.** `UnsavedWorkouts.tsx:66,170`, `ReviewSession.tsx:75,111` and
  `ReadOnlyRecording.tsx:13` render `PM5 · Sep 8 · Not saved` and
  `Discard PM5 workout X`. Phase MT's RF32 census (2026-09-08) LEFT these
  deliberately: the label's whole job is telling the reader a MACHINE recorded
  the row rather than the phone timer, which is RF32's own
  naming-the-source-of-a-stored-number exemption. It reads against `Timer` as
  its opposite, and swapping it to `Monitor` would change one word across
  three screens at once.
  **HIS REASON, which decides the shape of any future attempt:** the label
  carries provenance AND device identity, and the two do not separate on these
  screens. So `Monitor · Sep 8 · Not saved` keeps the provenance half and drops
  the identity half — a strict loss, not a clarity win. RF32 covers it as
  written.
  **The successor is DELIBERATELY UNFILED, and that is a decision, not an
  oversight.** If the entanglement ever bites, the fix is a design pass
  separating the two jobs on the row (a provenance word plus the device's own
  caption), behind a Gate 0. It is **not** a copy sweep and must not be filed
  as one — filing it as a sweep is how it would get done wrongly and cheaply. Related: the NFC connecting card's copy WAS
  changed in the same census, on a screen whose shape was Gate 0 approved
  2026-09-06, one day before the RF32 rule existed; the change is wording-only
  (no captures owed, James 2026-08-23) and the review judged it correct, but
  it is the precedent this row would follow.
  **STRUCK from this row, 2026-09-09 (fix round): it used to call itself "the
  one place RF32 was not swept" and "the last user-facing `PM5` vocabulary
  outside disambiguation". Both were false when written** — the census had
  missed `driver.ts`'s eight `REJECTION_VERBS`, which reach a rower as
  `ConnectedError.detail` on all three failure doors and printed
  `PM5 rejected frame 0`. They now read "The monitor …", gated by a test that
  derives its reason list from the driver's own exhaustive `Record`. The two
  struck sentences are RF30's shape: a later census reads a completeness claim
  INSTEAD of re-running the grep, so the wrong one costs more than none.
  **What still says `PM5` to a rower, so the next census starts from a true
  list** (`grep -rn "PM5" app/src` over string literals, run 2026-09-09):
  this row's provenance label; `MachineSummaryTable.tsx:34`'s
  `PM5 · PER INTERVAL` eyebrow and `useMonitorSession.ts:1723`'s "More than
  one PM5 has this name." (both are examples RF32's own text names as
  allowed); the device caption and `Couldn't reach PM5 …`, which interpolate
  the monitor's advertised name; `capacitorBle.ts`'s three targeted-scan
  errors (lines 192/199/206), which render in the DETAIL panel's `raw` slot
  and keep the name on a receipt recorded in that file; **THREE** lines of
  rendered article prose in `connectTheMonitor.tsx` — line 6 "Connected mode
  adds a Concept2 PM5", line 14 "The PM5 then runs the piece the way it runs
  a race", line 34 "You'll need a PM5 (the standard Concept2 monitor)" — none
  assessed by any census; and **10 note strings / 13 occurrences** in shipped
  release notes (its own row below).
  **THIS LIST HAS NOW BEEN WRONG TWICE, so re-run the commands rather than
  trusting the prose.** Round 1 wrote two false completeness claims (struck
  above); round 2 replaced them with this list and miscounted both of the
  numbers in it — `connectTheMonitor` as one mention when it has three, the
  release notes as "nine" when they carry 13 occurrences over 10 strings.
  Round 3 (2026-09-09) measured both:
  `grep -n "PM5" app/src/news/content/bodies/connectTheMonitor.tsx` → 3 hits
  (6, 14, 34, all inside rendered `<p>` prose);
  `grep -vn '^\s*//' app/src/news/content/releaseNotes.ts | grep -c "PM5"` →
  10 and
  `grep -v '^\s*//' app/src/news/content/releaseNotes.ts | grep -o "PM5" | wc -l`
  → 13 (the `-v` drops the file's ten `//` provenance comments, which are not
  copy). Both are counts of the tree at the Phase MT close-out branch.


## From `## Owed captures and walk items`

- ~~**JR PR 0b's capture walk**~~ — DONE 2026-08-31; six OPENs answered, OPEN 3
  bounded. Record at `docs/monitor/sessions/walk-2026-08-31-justrow/README.md`.

- ~~**JR OPEN 3's open half — does a PM5 power itself off with a central
  connected?**~~ RETIRED 2026-09-01 by ruling, not by evidence: James ruled we
  assume the connection stays open indefinitely and design for it, rather than
  spend an erg session settling it. Still unobserved and still undocumented —
  if a closer ever turns up in the wild it is a bonus, never something the
  design waits on.


## From `## Small, queued, rides the next PR in its area`

- **DONE (2026-09-07, PR #344): a rower who sets ONE baseline is told which
  one and offered the other at the 7 s offset.** James's ruling ("If a user
  sets a 2k or a 6k they should be asked to set both with a suggestion of the
  7s offset"), raised at Phase RW PR C's PM final gate: every screen collapsed
  a half pair to `null`, so a rower with a tested 2k read `NO BASELINE SET` on
  Today, which was false about their account. The PM ruled ASK, not force
  (forcing would make a 2k test's own result unsavable until a 6k it does not
  have), and James took the PM's decision. What shipped: Today's row names the
  stored side (`2K SET · NO 6K`) and fills the other on one tap, stamped
  `derived`; Library and the workout detail's captions name it too; the doors
  card states the consequence of leaving them unset. **The doors card now
  yields to that row whenever one side is stored** — Phase BL PR C had ruled
  the doors a superset re-entry for any incomplete pair, which sent a rower
  who typed a 2k in the I-know-my-baseline door back to `SET UP YOUR
  BASELINE`; that is the ordinary way to hold half a pair, and it never
  writes `baselinesSkipped`, so the first cut of this work reached only
  rowers who had skipped first. The estimate is suppressed when the derived
  split falls outside the storable 60..240 band, matching the refusal
  `BaselineEditor`'s and `postTestOffer`'s offers already make, and a failed
  write says so rather than leaving a button that does nothing. The You
  editor keeps its own existing counterpart offer (`deriveOffer` /
  `DeriveSlot`) unchanged; no second ask was added there.
  **Why not force** (PM, 2026-09-07, on James's follow-up "I feel like it's
  natural but maybe it'd bother some people" — and it is NOT the consistency
  argument): a rower made to fill a 6k they never rowed types a guess, and
  `KnowBaseline.tsx` stamps a typed field `manual`, permanently
  indistinguishable from a rowed number, while the declined offer would have
  stored `derived`. Force degrades the provenance record it means to
  complete, and it cannot be done honestly at the erg — removing the
  post-test Skip holds a real measurement hostage to a heuristic. **Why not
  silent auto-fill:** this repo's line is not "never store an estimate"
  (`Recommend.tsx` stores both sides as `estimated` from a hand-authored
  table), it is that the rower SAW it and the provenance is recorded.
  **And the 7 s is an offer, not a fact:** `estimateBaseline.ts` grounds it
  on Paul's Law (≈ +7.9 s, SECONDARY, a forum post, trained rowers) and says
  in terms that no source grounds a better per-population gap;
  `deriveBaseline.test.ts` pins the constant and nothing about any real pair.

- **DONE (2026-09-07, PR #348): v0.42.0's notes corrected, and the tag it
  was written for DELETED unreleased.** Item 2 promised "a quiet **NO
  BASELINE SET** line" and that "setting a baseline any time puts the numbers
  back"; after #344 a half-set rower reads `2K SET · NO 6K`, and setting ONE
  side does not put the numbers back. James, 2026-09-07: "We won't release
  that tag" — so `v0.42.0` (which sat at `8326fb2c`, #344's base, and never
  reached TestFlight) was deleted locally and on the remote, and the VERSION
  is free to be re-cut at whatever main is when he releases. The notes entry
  keeps its `v0.42.0` label and `e2e/releasePin.ts` is unchanged for the same
  reason. Its provenance comment was re-counted over the full
  `v0.41.0..main` range (sixteen merges, RF15) and three items added: the
  half-set offer (#344), the verification-code narrowing (#341) and AVG HR
  (#345).

- **STRUCK 2026-09-09 (Phase OD): the comment now says exactly this, so the
  row's own first branch is satisfied.** `server/concept2/mapping.test.ts`
  (the block above the `mutation discriminator` case) states verbatim that the
  row is _"UNREACHABLE on the wire"_, that the extra key is _"deliberately
  cast past the excess-property check"_, and that _"it exists ONLY to make the
  two predicates disagree"_ — the honest reading the row asked for, rather than
  a reachability claim. Struck against the landed text, not against a memory of
  it. **Original filing (door PR A's PM gate, 2026-09-02):**
  `mapping.test.ts`'s `source, not deviceName, decides eligibility (mutation
  discriminator)` leg is pinned by TYPECHECK, not by its own assertion (the row
  said `:160-169`; the leg is at `:173-182` as of 2026-09-09 — grep the test
  title). The leg exists to make the retired
  `deviceName === null` gate and the live `source !== "pm5"` gate disagree,
  and to do it the fixture is cast past the excess-property check
  (`as unknown as Parameters<typeof eligibilityFailure>[0]`) onto a row
  shape the wire cannot produce — `logSourceContradiction` 400s a
  `deviceName` on any non-pm5 row. So the runtime expectation discriminates
  a state only the cast can reach. Owed: either say so in the leg's own
  comment (the honest reading — it is a mutation discriminator, not a
  reachability claim), or reach the same disagreement through a supported
  producer. **XS**

- **RESOLVED (2026-08-31): `swapMark`'s `globalOnly: false` arm is pinned**
  — trigger pulled forward by James. The arm's only producer is synthetic,
  so `Plan.test.tsx` mocks one session's prescription (and nothing else);
  mutating the predicate to demand a global fails exactly the
  personal-match case.

- **RESOLVED (in the same PR that filed it): `stack-env.sh` now refuses an
  empty `REPO_ROOT`** with `: "${REPO_ROOT:?...}"` instead of hashing the
  empty string into the phantom `ergomatic-67295` stack. Probed both ways:
  unset -> loud refusal (exit 127, message names the fix); set -> the real
  per-worktree id, and `pnpm e2e`/`pnpm screenshots` both boot and pass.
  All three script consumers (`e2e.sh`, `screenshots.sh`, `walk-lab.sh`)
  set `REPO_ROOT` before sourcing, verified by grep. Session memory
  `stack-env-needs-repo-root` carries the incident.

- **RESOLVED (edge-marks gate + James's re-review, 2026-08-31): a
  pre-validation row with an unreadable `workoutType` renders a bordered
  shaded box that is a MEANINGFUL, accessible cue** — `--rule-2` fill,
  `--ink-4` border (4.76:1 / 4.48:1, clearing 1.4.11's 3:1 non-text
  floor; the first cut's 1.53:1 "decorative" framing was rejected on
  review), with a visually-hidden "type unknown" twin for AT. Box model
  equals a real badge's by construction (shared `.type-badge`, two
  no-break spaces, border compensated in padding) AND by measurement:
  `design.spec.ts` injects the badge into the live screen and asserts
  computed colours, an in-test 3:1 computation, and sub-pixel geometry.

- **RULED (edge-marks gate + PM gate, James, 2026-08-31): the
  self-contradicting mark keeps `INSTEAD OF` everywhere (option D), and the
  two designated test titles are RESERVED at ALL THREE workout-writing
  doors** — `POST`, `PUT`, and `POST /api/workouts/bulk` (the PM gate caught
  bulk unguarded in the first cut), one message (`title is reserved. Pick
  another name`, James's pick), mirrored at the Builder field. Legacy rows
  keep rendering and stay suggestable; **editing one without renaming it is
  ALSO rejected** — James's explicit ruling, declining the narrower
  changed-into rule ("I don't want to engineer a solution to an imaginary
  problem"). **The reservation is a fence around the string-keyed test
  identity, not a product principle** (PM): retirement trigger = a stable
  seed key replacing `isOnboardingTitle`'s remaining call sites. Name
  conflicts in general REMAIN allowed.

- **RESOLVED (post-#233 follow-ons): the screenshots project's version pin
  can no longer rot independently.** The class was two independent literals —
  `news.spec.ts`'s (CI-gated, bumped by every notes PR) and
  `screenshots.spec.ts`'s (no CI job, rotted at v0.18.0/#166 and
  v0.27.0/#232). Both now import ONE constant, `e2e/releasePin.ts`, so the
  ungated copy cannot drift from the gated one and CI still forces the bump
  through `news.spec.ts`. Running the screenshots project in CI was
  considered and not taken: it buys nothing this doesn't once the literals
  cannot diverge, at the cost of a capture pass per push. Deriving the pin
  from `RELEASE_NOTES` was rejected as a mirror (RF11) — the screen renders
  that same module, so it could only ever catch render breakage.
