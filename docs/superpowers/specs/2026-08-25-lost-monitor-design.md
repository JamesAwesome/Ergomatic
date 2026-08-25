# Phase LM, PR 1 — When the monitor is lost, say so and stop lying about it

## What and why

A tester connected their phone to the erg, programmed a workout, tapped "Show me
the numbers", locked the screen, put the phone in their pocket and rowed. When
they took it out and tapped End, the app had recorded nothing, and the row it
saved was labelled as though they had typed it in by hand. They reported the
workout as lost. It was.

We reproduced it first try on 2026-08-25
(`docs/monitor/sessions/walk-2026-08-25/`, finding W-10). Locking the phone
suspends the app; every Bluetooth event that arrives while it is suspended is
queued by iOS and delivered only on resume. After roughly thirty seconds of real
rowing the screen read `0m`.

**This spec does not try to keep recording while the phone is locked.** That is
PR 2, it is bounded by what iOS permits, and it can never cover a whole workout
(see "What we established about iOS" below). This spec is about the three ways
the app currently misleads a rower when the link dies — one of which is why the
tester believed the recording had vanished rather than failed.

Three defects, one story:

1. **The loss is easy to miss.** `· LOST` is small mono text in the header, next
   to the erg's serial number, while the numbers that fill the screen read
   `0:00.0` and `0`. That looks like a piece that has not started yet, not like
   an app that has gone deaf. James, shown the frame: *"the LOST isn't easy to
   notice, i think we need to highlight that more."*
2. **The banner promises something false.** "Row on. The erg is still counting
   and End keeps what we saw" is true whenever we saw anything, and a lie in the
   one case that costs a rower a workout — where we saw nothing at all.
3. **The saved row misdescribes its own provenance.** It reads `LOGGED BY HAND`.
   The rower did not hand-log it. They rowed, and we failed to hear them. Those
   are different facts and the record should not conflate them.

## Scope

**In:** the connected live surface's lost state (prominence and copy), and the
provenance label on both the live post-workout summary and the stored record.

**Out:** `UIBackgroundModes`, any native or plist change, reconnect-and-resume
mid-piece, and any change to what is stored on the wire beyond the label
derivation. PR 2 owns the first; the rest are named in "Deliberately not
decided" below.

## Rulings already taken (James, 2026-08-25)

- **Phase shape:** honesty now, background mode as PR 2 of the same phase.
  Honesty is needed either way, because even with the background mode a long
  pocketed row still loses data.
- **Provenance label:** `LINK LOST`. Not `PM5 · LINK LOST` (the device name is
  meaningless to a rower with one erg, and carrying it through costs plumbing on
  a path that currently drops it), and not "keep the label, add a line" (the
  label is what shows in compact list views where a line will not fit).
- **Plan credit:** a link-lost session that measured nothing **keeps all three
  exits**, `Log against plan` included, undemoted. The rower did the work; only
  our recording failed, and hand-logging against plan from targets alone is
  already normal and supported. Removing or demoting it would punish the rower
  for our defect.
- **Design gate (James, 2026-08-25, and it is binding):** the visual treatment
  of the lost state is **approved by James before any implementation begins**.
  This spec proposes a direction; it does not settle it. See "Gate 0" below.

## What we established about iOS (research pass)

Tagged per the house rule. The two-line summary: iOS HAS the concept of
listening while pocketed, but bounded in minutes, and we currently do not use
it at all.

- **PRIMARY (Apple, Core Bluetooth background processing).** Without
  `bluetooth-central` in `UIBackgroundModes`: *"All Bluetooth-related events
  that occur while a foreground-only app is in the suspended state are queued by
  the system and delivered to the app only when it resumes to the foreground."*
  We declare **no background modes at all** (`ios/App/App/Info.plist` —
  verified, the key is absent). This is a complete explanation of the observed
  0 m.
- **PRIMARY (Apple, same document).** With the mode declared, a woken app has
  *"around 10 seconds to complete a task"*, and the system *"may need to
  terminate your app to free up memory... causing any active or pending
  connections to be lost."*
- **SECONDARY (plugin maintainers, `@capacitor-community/bluetooth-le`
  discussions #514 and #679).** Notifications reach JavaScript while the app is
  backgrounded *but still running*; the plugin has *"no support for iOS state
  restoration"*; users report the listener dying after roughly five minutes.
  **The five-minute figure is a user report, not an Apple number — do not cite
  it as one.**
- **PRIMARY (App Store Review Guidelines 2.5.4).** *"Multitasking apps may only
  use background services for their intended purposes."* Reading a fitness
  monitor the rower is actively using is that purpose. **This retracts a claim
  the controller previously made about extra App Review scrutiny of a
  `bluetooth-central` declaration; it was unsourced and is withdrawn**
  (CLAUDE.md recurring failure #16).

**Does the system have the concept?** Yes for "keep listening while backgrounded
but running"; **no** for "run JavaScript indefinitely while suspended". So the
product may never promise a locked-screen recording, and PR 1's copy must not
imply one even after PR 2 lands.

**Already answered on our side, and it matters:** keep-awake is NOT missing.
`ConnectedInterstitial.tsx:283` arms it at mount and releases at unmount, so it
spans the entire connected flow including the live surface — added in response
to James hitting iOS sleeping mid-row on 2026-08-11. **The pocketed-phone loss
is therefore a MANUAL lock, not an auto-sleep regression, and no wake-lock work
would have prevented it.** Any proposal to "add a wake lock" is already done and
is not the fix.

## Gate 0 — James approves the visual treatment before implementation

Binding, and it precedes Task 1. The implementer does not start until James has
seen and approved the lost-state treatment. What gets presented to him:

- A rendering of the live surface in the lost state with **something measured**,
  and a second with **nothing measured**, since the two carry different copy.
- Both against the real design tokens, with the contrast ratio of every new
  colour pairing **computed and stated as a number** (CLAUDE.md recurring
  failure #6 — a token shipped at 3.29:1 once and was caught only by a later
  scan). WCAG AA and 44 px hit targets are hard requirements.
- The proposal must say what happens to the hero numbers, which is the crux:
  they currently read as live measurements while we are deaf.

**Direction this spec proposes (NOT settled — Gate 0 decides):** the lost state
is promoted from a header suffix to a state the surface as a whole is in, and
the hero numbers stop presenting as live readings. Whether that is dimming,
struck-through, replaced by the lost message, or something James prefers is
his call, not this spec's.

## Task 1 — Establish why the manual door rendered (investigation, no fix)

**Do this before writing any code, and report the answer.**

Observed: the saved record read `AUG 25 · LOGGED BY HAND` with **no time-of-day
segment** (`phone-lost-saved-row.png`). Both facts point at
`buildManualModel`, because `buildMonitorModel` (`summaryModel.ts:922`) sets
`sourceLabel: run.deviceName` and always carries a `timeLabel`. So the
connected session did not merely get a wrong label — it appears to have been
rendered by the **manual door** entirely.

Two candidate mechanisms, and the fix site differs between them:

- **(a) Door fallthrough.** `monitorModeRun` (`LogSession.tsx:254`) returns
  `null` on any of four conditions (`from !== "monitor"`, `completedAt === null`,
  `workoutId` mismatch, or `buildMonitorLogSteps` throwing), and `null` falls
  through to the manual door at `LogSession.tsx:1578`. Note `buildMonitorLogSteps`
  throws only on a missing or mis-sized `logSeed` (`logDraft.ts:834-840`), **not**
  on zero actuals — so if this is the mechanism, it is one of the other three
  conditions and the report must say WHICH.
- **(b) Label inference only.** The monitor door did render, and
  `storedSummary.ts:252`'s `sourceLabel` fell through its own ladder
  (`deviceName` → stopwatch → `LOGGED BY HAND`) because no device name was
  stored.

**These are not both true and the spec does not assume either.** Reproduce
against the committed evidence and a unit fixture (a link-lost close with zero
actuals), determine which, and report it. If it is (a), the label fix alone is
cosmetic and the real defect is the door, which changes Task 3's shape — say so
rather than patching the label and calling it done.

CLAUDE.md item 10 applies: **if what you observe contradicts this spec, say so
in your report instead of working around it silently.**

## Task 2 — The banner branches on what we actually have

Failing test first. Two messages where there is one today, chosen on whether the
run has recorded any actual:

- **Something measured.** The message may keep its current promise, because it
  is true, and should name the count so the rower knows what survives. Shape,
  not final copy: the erg is still counting, and End keeps the intervals we
  recorded.
- **Nothing measured.** The message must NOT say we kept anything. It says
  plainly that we have recorded nothing, and points at the monitor, which is
  still counting and is now the only place the rower's numbers exist. It must
  not imply the recording can be recovered by unlocking, because it cannot.

House copy rules bind: **no em-dashes in user-facing strings** (periods, colons
or middle dots). Keep it short enough to read mid-stroke.

The existing string lives with the lost state in `useMonitorSession.ts` /
`ConnectedSurface.tsx`; find its single source rather than adding a second.

## Task 3 — `LINK LOST` provenance, one derivation, two screens

Failing test first. Shape depends on Task 1's answer; what does not depend on it:

- The label is derived from `endedBy === "link-lost"`, which the record already
  carries (`monitorRun.ts:51`, and `useMonitorSession.ts:2782` —
  `closeRecord(true, linkGone ? "link-lost" : "rower")`, so **End with the link
  gone already stores the right reason**). Nothing new is stored; this is a read
  of a fact we have.
- It must be **one derivation consumed by both screens** — the live
  post-workout summary and the stored record — the same way `buildTotalLine` is
  already one definition serving two screens. Two copies will drift.
- `storedSummary.ts` already renders a `linkLostLine` gated on the same
  `endedBy` (`:882`). **Reconcile with it**: the record must not say the same
  thing twice in two voices. Decide whether the line survives alongside a
  `LINK LOST` source label, and justify it in the PR.
- The `timeLabel` suppression at `storedSummary.ts:280` keys on
  `source !== "LOGGED BY HAND"`. A new fourth value walks straight into that
  condition. **A link-lost session HAS a real closing moment we know**, unlike
  the manual door — so it should carry its time-of-day. Do not let the new
  branch inherit the manual door's absence idiom by accident.

## Testing

docs/TESTING.md governs. Specifics this spec adds:

- **The fixture must look like the failure.** A link-lost close with **zero**
  recorded actuals is the case that shipped the bug; a fixture with actuals will
  pass while the real path fails (CLAUDE.md recurring failure #3).
- **Assert consequences, not existence.** Do not assert that a label function
  exists or that a branch is reachable — assert the rendered string a rower sees,
  for both the something-measured and nothing-measured cases (failure #4).
- **Check per-file coverage** for every file touched; the repo-wide gate will
  pass with new branches uncovered (failure #2).
- **`pnpm e2e` is mandatory** — this diff touches `app/src/` (failure #1). Run
  `pnpm screenshots` too if Gate 0's treatment changes the surface's layout, and
  **not** if it only changes wording (per James, 2026-08-23: captures are for
  layout and structure, never wording-only diffs).
- **Grep for dead CSS** if any element is removed by Gate 0's treatment
  (failure #5).

## Exit criteria

1. Gate 0 approved by James, with contrast ratios stated as numbers.
2. Task 1's mechanism established and reported, with the fix landing at the site
   the answer indicates.
3. A rower who loses the link mid-piece cannot mistake the surface for a piece
   that has not started.
4. The banner never claims to have kept anything when nothing was measured.
5. A link-lost row reads `LINK LOST`, on both the live summary and the stored
   record, from one derivation, and carries its time-of-day.
6. All three exits still offered on a nothing-measured close, `Log against plan`
   included and undemoted.
7. **A phone walk leg**: connect, program, show the numbers, lock, row, unlock,
   End. The only proof a rower notices is a rower noticing. Owed at PR 1's
   close, not deferred to PR 2.

## Deliberately not decided here

Each needs its own answer and none of them blocks PR 1:

- Whether a lost link mid-piece should be **recoverable by reconnecting** rather
  than only endable.
- Whether the rower should be **warned before locking** rather than told after.
- Whether `Log against plan` should ever be gated on measurement (James ruled it
  stays for now; the question can return with data on how often this happens).

## Gates

**TRIAD** — Task 3 changes what a stored row CLAIMS about itself. Full antagonist
pass on this spec before implementation, and a `product-manager` final-PR gate on
the PR. Not fast path: it touches a stored row's meaning, more than one product
file, and a wrong version misdescribes a real rower's real session.

## Record

- Walk record and reproduction: `docs/monitor/sessions/walk-2026-08-25/`
  (finding W-10, four phone frames).
- ROADMAP: `## Phase LM`, opened in PR #197.
- Sources: [Apple, Core Bluetooth background processing](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html) ·
  [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) ·
  [plugin discussion #514](https://github.com/capacitor-community/bluetooth-le/discussions/514) ·
  [#679](https://github.com/capacitor-community/bluetooth-le/discussions/679).
