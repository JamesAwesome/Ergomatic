# Phase LM, PR 1 — The session that never started

> **REVISION 2 (2026-08-25).** Revision 1 was BLOCKED by the antagonist anchor
> pass and rewritten. It diagnosed the defect as "we recorded a session and then
> lost it" and proposed a `LINK LOST` provenance label reading `endedBy` off the
> record. There is no record. The whole of revision 1's Task 3 was unreachable,
> and its PR 2 contradicted a standing James ruling. What changed and why is in
> "What revision 1 got wrong" at the end — read it before proposing anything
> that sounds like revision 1 again.

## What and why

A tester connected their phone to the erg, programmed a workout, tapped "Show me
the numbers", locked the screen, pocketed the phone and rowed. On unlock the app
had nothing, and the row it saved looked hand-typed. They reported the workout as
lost.

It was never recorded in the first place.

The app only starts a record when it SEES the first pull. `createMonitorRun` has
exactly one call site (`useMonitorSession.ts:1681`), inside the
`phase === "ready"` gate. Lock the phone before that pull and no frame carrying
one ever arrives, so the phase never leaves `ready`, no record is created, and
End has nothing to close — `closeRecord` (`:1477`) opens with
`if (run === null || run.completedAt !== null) return`.

The file says this about itself already, at `useMonitorSession.ts:988-990`:

> the phase never leaves `ready`, `createMonitorRun` never runs, the panes keep
> painting live numbers off the fall-through `update({ frame })`, and End
> produces a session with no record and no error anywhere.

**That is the defect, and the three symptoms the rower actually meets are all
downstream of it:**

1. **The screen looks like a session in progress when it is not.** The panes
   paint live-looking numbers from fall-through frames while the phase is still
   `ready`, and the only contrary signal is `· LOST` in small mono text beside
   the erg's serial number. James, shown the frame: *"the LOST isn't easy to
   notice, i think we need to highlight that more."* He is describing the right
   thing for a reason this spec now understands better than he was told: the
   numbers are not stale readings, they were never readings.
2. **The banner promises something false.** "Row on. The erg is still counting
   and End keeps what we saw" is true whenever we saw something and a lie in
   exactly the case that costs a workout.
3. **The saved row poses as hand-logged.** `monitorModeRun` returning `null`
   falls through to the manual door (`LogSession.tsx:1578`), whose save posts
   neither `deviceName` nor `endedBy` (`:1605-1612`), so the stored row has
   `device_name = NULL` and `ended_by = NULL` and `sourceLabel` lands on
   `LOGGED BY HAND`. The rower rowed. We did not hear them. Neither of those is
   "logged by hand".

**Which evidence carries which claim**, because these are not equally proven and
the spec should not launder one into the other:

- **The proximate defect is PROVEN**, not merely a surviving candidate:
  `createMonitorRun`'s single call site inside the ready gate, `closeRecord`'s
  `if (run === null …) return`, the walk's END form reading `TARGETS ONLY ·
  NOTHING MEASURED`, the saved row reading `LOGGED BY HAND`, and James's own
  tester report at `ROADMAP.md:3271` naming the pre-row state directly.
- **`run === null` as the specific `monitorModeRun` condition that fired is
  ELIMINATION, not observation.** That function has five null-producing
  conditions, and the `LOGGED BY HAND` row alone is consistent with all five —
  it is the pre-row-state observation that pins it. Task 1's third bullet exists
  because we cannot currently tell which fired, and it makes the next occurrence
  say so.
- **The CAUSE of the zero is not established at all.** See below.

## Scope

**In:** the pre-row state's honesty on the connected surface (prominence and
copy), and the silent fall-through that lets a connected session save as a
manual one.

**Out of what PR 1 SHIPS:** any plist or native change. `UIBackgroundModes` was
ruled against by James on 2026-08-20 and stays unshipped here. Also out:
reconnect-and-resume mid-piece, and correct resume itself, which is PR 2.

**In, as measurement only:** the §D1e probe builds one throwaway variant WITH
`bluetooth-central` declared, to measure the delta. That build is never merged.
James folded this in on 2026-08-25 because the never-started case falls outside
the 2026-08-20 ruling's scope — see Task 1.

## What is already settled, and must not be re-litigated

- **Keep-awake is not missing.** `ConnectedInterstitial.tsx:283-286` arms it at
  mount and releases at unmount, and that component renders `ConnectedSurface`
  itself (`:716`), so it spans the whole connected flow. It was added after
  James hit iOS sleeping mid-row on 2026-08-11. An idle-timer disable cannot
  block a power-button lock, so **this was a manual lock and no wake-lock work
  would have prevented it.** VETTED by the anchor pass.
- **The background question is ANSWERED, against a background mode.**
  `ROADMAP.md:2095-2130` and `docs/superpowers/research/2026-08-20-ble-connection-management.md`.
  James's ruling: *"backgrounded YES, terminated NO"*, and *"The recommendation
  is CORRECT RESUME, not a background mode."* The obstacle is not iOS's app
  lifecycle but **WebKit's WebContent throttler**, whose runnable set is
  *visible, audible, capturing* — and *"not one step in that chain reads
  `UIBackgroundModes`."* So "the link stays up" and "we keep logging the row"
  are different claims and the mode buys only the first.
- **The ready gate already has a fallback and it does not help here.** The
  `rowingActive` fallback (`useMonitorSession.ts:978-1010`) accepts five
  consecutive strictly-increasing-distance frames when the Rowing State byte is
  untrustworthy. **Both legs need FRAMES CARRYING A PULL**, and on this walk
  neither opened — which is consistent with no frames arriving AND with frames
  arriving after the rower had stopped. Do not propose widening the gate as the
  fix, and do not read this bullet as settling which happened (see below).
- **Plan credit stays.** James, 2026-08-25: a session that measured nothing
  keeps all three exits, `Log against plan` included and undemoted. The rower
  did the work; only our recording failed. VETTED — nothing gates `advancesPlan`
  on measurement.

## What we do NOT know, and must not assert

**No copy, comment or PR body may state a cause for the zero — and that includes
Task 2's warning, which revision 2 violated.** THREE producers have the identical
symptom and we have not distinguished them:

- iOS/WebKit delivered no frames while suspended.
- Frames arrived and the ready gate refused them (it needs `rowingActive` AND
  increasing distance; a rower who stops before unlocking supplies neither).
- **The link dropped while suspended** (delta pass — revision 2's enumeration
  missed this one). Apple, PRIMARY, via the research doc's §D2b: *"If the
  connection to the peripheral is lost while your app is suspended, you won't be
  aware that any disconnection occurred until your app resumes to the
  foreground."* The walk's own provenance row for piece 3 says `none (link
  lost)` — but see Task 1 on why the `· LOST` banner is not evidence for this.

Against the platform explanation: `pm5-interface-notes.md:4663` records a
15-20 s screen lock NOT dropping the GATT link, with *"the session resumed
ticking on unlock"*. The walk's own W-10 declines to establish the mechanism.

PR 2's shape depends on which it is, so **Task 1 instruments it and the §D1e
probe measures it** rather than either being guessed.

## Gate 0 — APPROVED (James, 2026-08-25)

Presented as an artifact showing current vs proposed across three screens on the
real tokens, with every contrast ratio computed. **Approved with the
controller's recommendations**, plus two corrections James made in the review
that changed the work — both recorded in the tasks they affect:

1. **"Is it actually waiting?"** — it is, and the app already says `READY`.
   Task 2 became "stop erasing the ready state" instead of "add a waiting
   headline", and the root cause turned out to drive four displays, not one.
2. **The copy was far too long, and the warning was in the wrong place.** It
   moved to the ready screen and shrank to four words; the lost banner went from
   twelve words to three.

Rulings: warning shows **every session, quiet**; lost banner is **filled red**;
pre-row state gets **no banner at all**.

The original gate text follows, kept because it binds any FUTURE change to these
surfaces.

Binding, precedes every task. What gets presented to him:

- The connected surface in the pre-row state (connected, armed, no pull seen),
  and in the lost-after-rowing state, since they carry different copy and are
  currently indistinguishable.
- Against real design tokens, with the contrast ratio of every new colour
  pairing **computed and stated as a number** (recurring failure #6). WCAG AA
  and 44 px hit targets are hard requirements.
- The proposal must say what happens to the hero numbers. That is the crux: they
  currently read as measurements and are not.

**Direction proposed, NOT settled — Gate 0 decides:** the pre-row state becomes
a state the surface is visibly in, rather than a suffix in the header, and
numbers that were never measured stop being rendered as if they were.

## Task 1 — Instrument the silence, and run the §D1e probe on the back of it

Failing test first. Add diagnostics that make the next occurrence
self-diagnosing:

- A ring entry when `endSession` closes with **no record** — today it returns
  silently (`:1477`), which is why this cost a tester a workout and two days to
  find.
- A ring entry recording, at resume, **how many frames arrived while hidden** and
  what the ready gate saw (`rowingActive`, whether distance increased).
- A ring entry naming **which** `monitorModeRun` condition missed when it returns
  `null`, so the fall-through is never again silent.
- ~~A wall clock on the ring, which it does not have today.~~ **FALSE, and
  corrected at Task 1's implementation (2026-08-25).** The ring has stamped
  `atMs` (epoch milliseconds) on every entry since Phase LL Task 1 —
  `eventLog.ts:39`, and visibly so in this phase's own committed walk rings
  (`rests-finished-ring.json`, `"atMs":1787693708947` = 2026-08-25T21:35:08Z).
  The claim came from `2026-08-20-ble-connection-management.md` §D9 item 4,
  which was already stale when it was cited. **Lesson, and it is the same shape
  as this phase's other two: a research doc's claim about OUR OWN code gets
  checked against the code, not quoted.** The probe needs no new timestamp.

### The readout must exist on the PHONE, in the never-rowed case (delta pass, BLOCKING)

Revision 2 planned to write all of the above into the existing diagnostics ring.
**In the flagship case that ring cannot be read on a device**, and the spec did
not check:

- `useMonitorSession.ts:2296` writes the durable stash inside
  `if (runRef.current !== null)`. In the never-started case that is `null` by
  definition, so `ergomatic:last-rowed-log` **is never written**.
- `LogSession.tsx:743`'s `MonitorLogRow` renders only when that key exists — its
  own comment: *"a session that never rowed has no key at mount and none ever
  materializes later either."*
- `RecordingDownloadRow` (`:691`) gates on a dev-only global, absent from every
  production build.
- The other key is `sessionStorage` with a console-only readout, and there is no
  console on iOS — the walk README's own provenance row for piece 3 reads
  `Diagnostics ring | none (no console on iOS)`.

So a phase whose entire subject is the never-rowed session planned to instrument
it into a store that is run-gated, session-scoped and console-only.

**Required:** write the diagnostics unconditionally (a third key, or lift the
run gate), in **`localStorage`** as §D1e originally specified and NOT
`sessionStorage` — a WebContent process kill is one of §D1e's own three outcomes
and would destroy session-scoped evidence, i.e. the instrument would erase
exactly the result it was built to catch. Render a copy affordance that does not
require a run. **Criteria 8 and 9 are unsatisfiable until this exists**, and
without it the next pocketed phone costs another walk, which is the whole reason
Task 1 exists.

### The probe (James, 2026-08-25 — fold §D1e in rather than defer it)

`2026-08-20-ble-connection-management.md` §D1e specifies it and its own closing
line is **"Do not write a spec that assumes either answer"** — which revision 1
did, in both directions. Procedure, verbatim in substance: row, background the
app for ~60 s, return, read the record.

- Stamps spanning the background window → **JS ran** while backgrounded.
- A hole with a matching gap → **JS was frozen**.
- A hole AND the app back on its home screen with an empty session → **the
  WebContent process was killed** and Capacitor reloaded the page.

**Run it twice: once with `bluetooth-central` declared, once without.** §D1e:
*"The delta between those two runs is the entire value of the background mode,
and it is currently unmeasured."*

**PR 1 SHIPS NO PLIST CHANGE.** The declared-key build is a throwaway probe
build, never merged. If the delta turns out to be real, the declaration becomes
its own decision with James, on evidence — it does not sneak in through this PR.

**Why this is worth two builds:** James's 2026-08-20 ruling ("correct resume,
not a background mode") reasoned about an interruption to a session already
RUNNING. The never-started case is outside that scope: correct resume has
nothing to correct toward, because there was never a start. If the queued frames
do drain on resume (§D2a's INFERENCE, explicitly unestablished), the ready gate
could open retroactively and the row would be RECOVERED rather than apologised
for — which is a thing correct resume alone cannot do.

### The probe's own procedure, corrected (delta pass, MAJOR)

Revision 2 inherited §D1e's wording verbatim and did not check it against what
the conclusion needs. Three corrections, all binding:

- **Run it in BOTH states, and say which is which.** §D1e's *"Row, background
  the app"* opens the record first, which tests the drain but makes the ready
  gate irrelevant. This spec's justification is the opposite state — retroactive
  ready-gate opening, which only exists BEFORE the first pull. Both are wanted;
  neither substitutes for the other. Label each run.
- **The rower must KEEP ROWING throughout the background window.** For a drained
  backlog to open the ready gate it must contain frames carrying a pull.
  Backgrounding and resting produces a frame count that says something about the
  drain and nothing about the gate. §D1e does not say this and neither did
  revision 2 — recurring failure #13, an operator instruction nobody checked
  against what it must produce.
- **A frame count alone cannot separate the outcomes** (delta pass, MAJOR). It
  must be reported alongside:
  - **The stamp SERIES, not just the total.** "JS ran" and "backlog drained"
    give the same count; only the distribution separates them — and because the
    wall clock stamps at PROCESSING time, a drain reads as a hole then a burst,
    which looks like §D1e's "JS was frozen". Say which instrument discriminates
    which outcome.
  - **Connection state and any disconnect event on resume.** A low or zero count
    is equally consistent with the link having dropped, and Apple (PRIMARY, the
    research doc's §D2b) says you cannot know until resume: *"If the connection
    to the peripheral is lost while your app is suspended, you won't be aware
    that any disconnection occurred until your app resumes to the foreground."*
    Without this the central outcome is triply ambiguous.
  - **A denominator.** `pm5-interface-notes.md:137-138` (0x0034 default 500 ms)
    and `:4152` (~2 Hz, and the PM5 notifies even while merely `armed`) give
    ~120 frames per 60 s. Report observed against expected over the
    wall-clock-measured window, never a bare number.

**Existing weak evidence against the drain, which the probe must be able to
overturn:** on the 2026-08-25 walk the gate never opened, and a drained backlog
from during the row would have carried `rowingActive` and rising distance. That
leg SURVIVED the delta pass — the resume handler
(`useMonitorSession.ts:2649-2661`) latches `frameSilence` and marks the transport
suspect but does not tear down the driver, unsubscribe, or reset the streak, so a
backlog would genuinely reach the gate. **But it is not evidence about §D2a**,
because if the link was down there was never a backlog at all. Suggestive, and
about at most one of the three candidates.

**And do not read `· LOST` in `phone-lost-live.png` as evidence about the link:**
that same handler sets `frameSilence: true` on EVERY foreground event
unconditionally (`:2653`), retracting only after the hysteresis window. The
banner in that photo is our own resume code, not the device.

This ships in PR 1 because it is diagnostic only, it is small, and the next
pocketed phone should not cost another walk.

## Task 2 — Stop ERASING the ready state, and warn on the ready screen

**GATE 0 APPROVED (James, 2026-08-25), with a finding that changes this task's
shape: the fix is mostly NOT new copy. It is not throwing away state we have.**

James's question at Gate 0 — *"in the waiting step, is it actually waiting?"* —
turned out to be the whole task. It is waiting, and the app already owns the
word: `surfaceModel.ts:1111` builds `${ordinal} OF ${count} · READY` for the
armed state. The screen in the walk said `1 OF 1 · WORK` because
`armedMirror = status === "armed"` (`:836`) and `SurfaceStatus` is a single
union — `"live" | "paused" | "stale" | "armed"` (`:70`) — so **the moment the
surface goes stale it stops being armed**, and every armed behaviour collapses
at once.

**Four consumers flip together** (all verified this session), and they account
for the whole of the walk screenshot:

| Consumer | Armed | What the walk showed once stale |
| --- | --- | --- |
| `intervalLabelShort` (`:1122`) | `1 OF 1 · READY` | `1 OF 1 · WORK` |
| `paceActual` (`:855`) | mirrors the target as a preview | `LAST 0:00.0` |
| `rateActual` (`:867`) | `0` | `LAST 0` |
| `totalLeftSeconds`/`elapsedSeconds` (`:1067`, `:1077`) | un-started | `EST LEFT 8:24`, estimating a piece that never began |

So this is ONE root cause, not four copy defects. **Preserve armed-ness across
staleness** rather than patching four displays independently.

**This makes Task 2 carry number weight, and it is not fast path.**
`totalLeftSeconds`/`elapsedSeconds` are numbers a rower reads; a wrong version
produces a wrong `EST LEFT`. Failing test first, per-consumer, and the test
fixture must be a stale-AND-never-rowed surface — the exact combination the
union currently cannot express.

**What ships, per Gate 0:**

- **Pre-row state: restore `READY`, invent nothing.** No banner, no headline, no
  new sentence. `1 OF 1 · READY`, with the two numbers labelled `TARGET`, so
  nothing that was never measured poses as a measurement.
- **The warning moves to the READY SCREEN** (`ConnectedInterstitial`'s
  programmed state, under *"The monitor starts the clock on your first
  stroke."*) — read standing still, not mid-stroke. **Four words:
  `KEEP THE SCREEN ON`**, on a sunken strip with a `--marker` rule. It asserts
  no cause, promises no sufficiency, and survives whichever way the probe lands.
- **Frequency: every session, quiet** (James's ruling at Gate 0). Four words on
  a screen the rower passes through anyway; a once-per-device rule risks the
  rower who forgets.
- **Contrast, computed not eyeballed:** `--marker` on `--surface` 6.49:1, on
  `--surface-sunken` 5.50:1. Floor is 4.5:1.

**Watch for the same collapse elsewhere.** The union makes every status
mutually exclusive, so anything else keyed on a status member is a candidate for
the identical bug. Sweep the grid and the progress bar before calling this done,
and report what you find even if it is nothing.

### The pre-emptive warning (James, 2026-08-25 — "a warning on the ready screen not to sleep the screen")

**This is the only PREVENTIVE element in PR 1.** Everything else here tells the
rower after the workout is already gone. The ready state is where the rower
stands in the seconds before they pocket the phone, so it is the one place a
warning can still change the outcome.

Constraints on it, all of which the wording must respect:

- **It is not "the screen may sleep".** Keep-awake is armed for the whole
  connected flow, so a screen timeout is not the route in. **But its EFFICACY is
  INFERENCE, not vetted ground** (delta pass moved this off): the plugin sets
  `UIApplication.shared.isIdleTimerDisabled`, Apple's documentation for that
  property could not be retrieved, so whether Low Power Mode or any other state
  overrides it is UNESTABLISHED; the native arm is armed fire-and-forget with no
  catch (`ConnectedInterstitial.tsx:283`), so an arming failure is silent; and
  the web arm is best-effort and may be a no-op. Say the true thing, not the
  plausible one, and do not build copy that depends on keep-awake never failing.
- **It must be TRUE UNDER BOTH PRODUCERS, and revision 2's own licensed wording
  was not** (delta pass, BLOCKING). Revision 2 licensed *"we hear the erg only
  while the app is on screen"* — that is producer #1 stated as fact, in shipped
  copy, in the same document that forbids asserting a cause and in the same PR
  whose probe exists to decide between the two. If §D2a's drain holds, that
  sentence scolds a rower about a non-problem and teaches them a false model of
  the app. **The wording must hold whichever way the probe lands**: say what the
  app can be relied on to WATCH, or point at the erg's own memory as the
  backstop, rather than claiming what it can or cannot hear. If no such wording
  survives Gate 0, the warning waits for the probe rather than shipping a guess.
- **It must not imply the outcome is wholly in the rower's hands.** An incoming
  call, Siri, and a WebContent process kill all background the app with no rower
  action — and `releaseNotes.ts:158` already names *"a phone call taking the app
  to the background"* as a shipped cause of the lost banner. Copy that only warns
  about locking is incomplete, and blames the rower for cases they did not cause.
- **It must not become a permanent scold.** Most rowers never lock the phone,
  and a warning shown every session on a screen seen every session is noise
  that gets tuned out — at which point it stops working for the rower who
  needs it. Whether it is always-present-but-quiet, once-per-device, or shown
  only after this has bitten before is a **Gate 0 decision**, not this spec's.
- **Copy rules bind:** no em-dashes in user-facing strings, and short enough to
  read while settling onto the seat.

Exit criterion 2 covers the state's distinguishability; the warning gets its own
criterion below because a rower can meet a clear ready state and still lock the
phone.

## Task 3 — The banner tells the truth, and asserts no cause

Failing test first. Two messages where there is one today.

- **Something measured:** may keep its promise, because it is true, and should
  name what survives.
- **Nothing measured:** must not claim we kept anything. It says plainly that we
  have recorded nothing and points at the monitor, which is still counting and is
  now the only place the rower's numbers exist. It must not imply unlocking
  recovers anything, and **must not name a cause** (see above).

**GATE 0 RULINGS ON THIS BANNER (James, 2026-08-25):**

- **Filled red** (`--judge-slower` ground, `--surface` text, 7.94:1), not the
  sunken variant. Unmissable at arm's length. Note the one risk accepted with
  it: red also means "slower than target" a column away, so nothing else on
  these panes may take a filled red treatment.
- **Cut the copy to the bone.** James, on revision 2's wording: *"Too much
  prose. Holy fuck why is everything a whole sentence. This is a workout app
  people aren't going to read a fucking novel of warnings."* Twelve words became
  three: **`LOST THE MONITOR` / "2 intervals kept."** He also rejected "Nothing
  new" as reading off — the title already carries that.
- **`LAST` becomes `LAST SEEN`** on both heroes, and everything stale greys to
  `--ink-3` together, including the metres. That is the existing house idiom
  (*"every stale value greys to --ink-3"*), not a new treatment.
- **The banner is keyed on the LINK, not on the phase.** ~~It does not appear on
  the pre-row state at all.~~ **CORRECTED 2026-08-25 at Task 3, and the error
  was the controller's transcription of Gate 0, not the implementers.** The
  artifact's proposed pre-row mockup drew a HEALTHY armed surface as the
  replacement for a LOST armed surface, which quietly conflated two different
  situations, and the spec line inherited the conflation. The correct rule:
  - **pre-row, link healthy** — no banner. Nothing is wrong, and `READY` says
    everything.
  - **pre-row, link lost** — banner renders, saying nothing was kept. This is
    James's actual bug case, and suppressing the banner here would put it back
    to `· LOST` in small mono, which is the exact thing he said is easy to miss.
  Task 2 already shipped it this way and pinned it with a deliberate test;
  Task 3 kept it and branched the copy honestly. Both were right to.

Copy length is a hard constraint on this task, not a preference: a rower reads
this mid-stroke or not at all.

Binding details the anchor pass established:

- The banner's single source is **`ConnectedSurface.tsx:616-624`** (`LostBanner()`,
  currently propless). `useMonitorSession.ts` only mentions it in a comment at
  `:2770`. Revision 1 pointed at the wrong file.
- The "measured anything" predicate must be **exported from `summaryModel.ts` and
  consumed in both places**, not written twice. `targetsOnlyCaption`
  (`summaryModel.ts:1107`) gates on `measured && (timeLabel || paceLabel)` via
  `isMonitorRowMeasurable` (`:872`, requires `actualSource === "pm5"` and
  `actualSeconds >= 1`). A naive "any actual" predicate disagrees with it on a
  sub-second actual, giving a banner that says we kept an interval and a summary
  that says `TARGETS ONLY · NOTHING MEASURED`. `targetsOnlyCaption` is already a
  one-rule-two-screens precedent (`storedSummary.ts:895`) — follow it.
- **Two shipped release notes describe this area and BOTH need checking**
  (revision 2 cited the wrong line and over-claimed; delta pass, MODERATE). The
  v0.17.0 items are at `releaseNotes.ts:155` and `:156`, not `:155` as the
  version key:
  - `:155` quotes the **eyebrow and the freeze** — *"LOST THE MONITOR appears,
    the live numbers visibly freeze instead of pretending"* — and names *"a
    phone call taking the app to the background"* as a cause. It does NOT quote
    the body sentence Task 3 rewrites, so it may remain accurate; check rather
    than assume, and note it also contradicts any warning copy implying the
    rower controls all the ways this happens.
  - `:156` says *"Ending a session under the lost banner stores it as
    link-lost"* and already carries a 2026-08-23 correction. **Task 4 can
    falsify this one**, because in the never-started case nothing is stored at
    all. Reconcile it with whichever Task 4 option is taken.

## Task 4 — A connected session that recorded nothing must not pose as hand-logged

Failing test first. **This is the TRIAD task.** The fixture is a `from=monitor`
arrival where `monitorModeRun` returns `null`.

The honest options, in preference order. **Pick one, justify it in the PR, and do
not silently take the cheapest:**

1. **Carry the door.** The manual-door save learns it came from the connected
   door and posts something that lets the stored row say what it is. **"Post a
   close reason" is NOT yet a decidable option** (delta pass, MAJOR) — both
   candidate fields are determined wrong as they stand, and this option is not
   choosable until the PR names a field, a value, and a migration:
   - **`endedBy`** is a Postgres `pgEnum` of exactly five values
     (`server/db/schema.ts:68-74`; client union `monitorRun.ts:51`), and **none
     of them means "connected, never saw a pull"**. `link-lost` asserts a cause
     this spec forbids. A sixth value is a migration the spec never mentioned,
     subject to the Drizzle timestamp-ordering trap — and it would render
     nothing anyway, because `buildLinkLostLine` (`storedSummary.ts:881`) is a
     deliberate equality check on `"link-lost"` whose own comment explains it is
     not a negation precisely so a future sixth value cannot silently start
     rendering.
   - **`deviceName`** flips `sourceLabel` (`storedSummary.ts:252`) to the erg's
     name and additionally grants the row a `timeLabel`. ~~That claims PM5
     provenance for numbers that came off nothing.~~ **REASONING CORRECTED at
     Task 4 (2026-08-25) — the conclusion holds, the argument did not.** The
     app ALREADY ships exactly that for the sibling case: a run that exists but
     measured nothing renders `PM5 <name>` beside `TARGETS ONLY · NOTHING
     MEASURED`, because `buildMonitorModel` sets `sourceLabel: run.deviceName`
     (`summaryModel.ts:1025`) with no measurement gate. So "claims provenance
     for nothing" cannot be the objection; it is established behaviour.
     **The real objection is simpler and fatal: with no record, `deviceName` is
     UNKNOWABLE.** There is nothing to read it from. Do not quote the struck
     text in a PR body.
2. **Live screen only, stored row explicitly left wrong.** Correct what the rower
   sees at save time and accept the stored row keeps reading `LOGGED BY HAND`.
   Acceptable at PR 1's scope, and **only if the PR states the full cost in plain
   words**: the stored row is permanently and unbackfillably indistinguishable
   from a genuine hand-log — there is no other stored signal and nothing can
   reconstruct it later — **for this row and every earlier one**. That honest
   statement is what makes option 1's migration worth its price or not.

**`LINK LOST` must NOT become a `sourceLabel` value.** `sourceLabel` answers
"where did these numbers come from"; `endedBy` answers "how did this close". They
agree only on the zero-measured close. On a link that drops after 3 of 4
intervals, a `LINK LOST` source label would stamp failure over genuinely
PM5-measured rows and delete the only signal saying they came off the machine —
and `LINK_LOST_LINE` (`storedSummary.ts:874`) already exists to say exactly that
on a row with data. This is the mirror shape in display clothing, and revision 1
had it.

If a derivation branches on `endedBy` at all, it must be **exhaustive over six
values** — `finished | rower | link-lost | program-failed | interrupted |
undefined` (`monitorRun.ts:182`, validator `:428-433`). A
`endedBy === "link-lost" ? X : deviceName` shape silently defines the other five.

## Testing

docs/TESTING.md governs. Specifics:

- **The fixture must look like the failure**: a `from=monitor` arrival with NO
  record at all — not a record with zero actuals, which is a different and
  currently-working path (recurring failure #3). Revision 1's proposed fixture
  was the wrong one.
- **Assert the rendered string a rower sees**, for both branches, not that a
  helper exists (failure #4).
- **Per-file coverage** for every file touched (failure #2).
- **`pnpm e2e` is mandatory** — this touches `app/src/` (failure #1).
  `pnpm screenshots` only if Gate 0's treatment changes layout, never for
  wording-only (James, 2026-08-23).

## Exit criteria

1. Gate 0 approved by James, contrast ratios stated as numbers.
2. A rower can tell, from the connected surface, whether the app has seen a pull.
   Structural assertion plus James's eye at Gate 0 — "cannot mistake" is not
   falsifiable on its own.
3. The ready state carries a warning that keeping the app on screen is what
   lets us hear the erg, worded so it neither blames the screen timeout (which
   keep-awake already handles) nor promises that staying foregrounded is
   sufficient. Its frequency is whatever Gate 0 chose.
4. The banner never claims to have kept anything when nothing was measured, and
   names no cause.
5. One exported RULE decides "measured anything", consumed by both the banner and
   the caption. Note the two consumers hold different shapes — `targetsOnlyCaption`
   takes `SummaryRow[]` (`summaryModel.ts:1108`), `isMonitorRowMeasurable` takes a
   `LogStep` (`:872`), and the banner renders from `session.actuals:
   IntervalActual[]` (`ConnectedSurface.tsx:456`) or, in the flagship case, no run
   at all. So this is one rule plus one adapter per consumer, **with the adapters
   tested against each other**, not one function called twice.
6. A connected session that recorded nothing does not present as hand-logged on
   the live summary; and the PR states plainly whether the STORED row is fixed
   too or left wrong.
7. All three exits still offered, `Log against plan` included and undemoted.
8. `endSession` closing nothing, and `monitorModeRun` returning null, each leave
   a ring entry naming why; the ring carries a wall clock.
9. **The §D1e probe is run and reported with a STAMP SERIES, a link-state
   readout, and an observed-against-expected frame count** (~2 Hz over the
   wall-clock window), both with and without `bluetooth-central`, and in both
   the before-first-pull and mid-row states, with the rower rowing throughout.
   A bare count does not satisfy this — see Task 1 for why each instrument is
   needed. **Stated pass/fail for the drain question:** §D2a HELD if frames
   covering the background window are delivered within a few seconds of resume
   at close to the expected count; FAILED if the window's frames never arrive.
   Anything between is reported as ambiguous, with the numbers, and settles
   nothing. No plist change is merged either way.
10. **A phone walk with three named outcomes, not two legs assumed to be two
   branches.** Leg A: **lock BEFORE the first pull** — this spec's flagship, the
   nothing-measured branch. Leg B: **lock MID-PIECE** — which may not be a defect
   at all, and has THREE possible landings the two-branch banner does not name:
   the continuity rule continues the run (cumulative wire registers mean no
   metres lost), or it returns `"reset"` and closes the record as `link-lost`,
   moving the surface to `ended` **while the rower is still rowing**, or the
   something-measured banner shows as designed. **Record which occurred**; do not
   report leg B as confirming the banner without saying which landing it hit.
   Requires a device build carrying the change; build 749 cannot show it.

**Hardware gating — RULED BY JAMES, 2026-08-25: "Have the walks block."**
Criteria 9 and 10 need a device build and erg time, and 9 needs two builds.
**PR 1 does NOT merge until they are met.** The controller proposed merging on
the desk-side criteria (1-8) with the walks as post-merge gates; James reversed
it, and the reversal is the binding version.

The reasoning to respect rather than re-argue: every desk gate this repo has
checks the app against itself, and this phase exists because a rower lost a
workout that every one of those gates would have passed. Criterion 10 leg A is
the ONLY check that the flagship defect is actually fixed on a phone, and
criterion 9 is the only thing that turns three candidate causes into one. Merging
without them would ship a fix for a defect we had not confirmed we fixed —
recurring failure #11, in its purest form.

Consequence to plan for, not to route around: **PR 1 is blocked on James's
availability at the erg**, so batch the walk with anything else owed on hardware
rather than asking twice, and do not let the branch rot in the meantime.

## What revision 1 got wrong

Recorded so the next reader does not rediscover it, and because four of the five
were already written down in this repo:

- **"The record already carries `endedBy`."** True of the writer, vacuous at the
  constructor. There is no record in the flagship case.
- **The Task 1 dichotomy** ("door fallthrough" vs "label ladder") was not
  exhaustive and both candidates were killed by the spec's own photograph:
  `phone-lost-saved-row.png` shows the `WORKOUT COMPLETE` eyebrow, which lives
  only in `PostWorkoutSummary.tsx:639` — the LIVE summary, which `storedSummary.ts`
  cannot produce. The surviving mechanism, `run === null`, was the one condition
  revision 1's own enumeration dropped.
- **`ROADMAP.md:3271` already had the mechanism**, from James's original tester
  report on 2026-08-24: *"still in the pre-row state with no record — END
  silently discarded it (the never-rowed path has no save door)."*
- **The research answered at the wrong layer.** Apple's Core Bluetooth
  background-mode documentation is accurate and governs the NATIVE app; our
  logging runs in a WebView. `docs/superpowers/research/2026-08-20-ble-connection-management.md`
  had established this, and James had ruled on it, five days earlier.
- **"A complete explanation of the observed 0 m."** Queue-and-deliver predicts
  data ARRIVING on resume, not zero. An explanation is complete only if it
  predicts the observation uniquely.

## Gates

**TRIAD** on Task 4 — it changes what a stored row claims about itself. Full
antagonist pass done on this spec (anchor pass, revision 1 BLOCKED; this revision
owes a delta pass before implementation). `product-manager` final-PR gate on the
PR. Not fast path.

## Record

- Walk and reproduction: `docs/monitor/sessions/walk-2026-08-25/` (W-10).
- ROADMAP: `## Phase LM`; the original tester report at `:3271`; the background
  ruling at `:2095-2130`.
- Prior research: `docs/superpowers/research/2026-08-20-ble-connection-management.md`.
