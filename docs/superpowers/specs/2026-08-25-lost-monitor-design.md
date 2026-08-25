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

**No copy, comment or PR body may state a cause for the zero.** Two producers
have the identical symptom and we have not distinguished them:

- iOS/WebKit delivered no frames while suspended.
- Frames arrived and the ready gate refused them (it needs `rowingActive` AND
  increasing distance; a rower who stops before unlocking supplies neither).

Against the platform explanation: `pm5-interface-notes.md:4663` records a
15-20 s screen lock NOT dropping the GATT link, with *"the session resumed
ticking on unlock"*. The walk's own W-10 declines to establish the mechanism.

PR 2's shape depends on which it is, so **Task 1 instruments it and the §D1e
probe measures it** rather than either being guessed.

## Gate 0 — James approves the visual treatment before implementation

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
- **A wall clock on the ring**, which it does not have today
  (`2026-08-20-ble-connection-management.md` §D9 item 4). This is what turns the
  instrumentation into the probe.

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

**Existing weak evidence against the drain, which the probe must be able to
overturn:** on the 2026-08-25 walk the gate never opened. A drained backlog from
during the row would have carried `rowingActive` and rising distance, which is
exactly what opens it. That is what "nothing drained" looks like — but no frames
were counted, so it is suggestive only. **Report the frame count, not just the
verdict**, so a null result is distinguishable from an unrun probe.

This ships in PR 1 because it is diagnostic only, it is small, and the next
pocketed phone should not cost another walk.

## Task 2 — The pre-row state is unmistakable

Failing test first, shape per Gate 0. The requirement, independent of treatment:
a rower looking at the connected surface can tell whether the app has seen a pull.
Numbers that have never been measured must not render as measurements.

## Task 3 — The banner tells the truth, and asserts no cause

Failing test first. Two messages where there is one today.

- **Something measured:** may keep its promise, because it is true, and should
  name what survives.
- **Nothing measured:** must not claim we kept anything. It says plainly that we
  have recorded nothing and points at the monitor, which is still counting and is
  now the only place the rower's numbers exist. It must not imply unlocking
  recovers anything, and **must not name a cause** (see above).

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
- **`releaseNotes.ts:155` quotes this banner's current behaviour in a shipped
  release note.** Changing the copy leaves that note describing something that no
  longer exists. Reconcile it in the same PR.

## Task 4 — A connected session that recorded nothing must not pose as hand-logged

Failing test first. **This is the TRIAD task.** The fixture is a `from=monitor`
arrival where `monitorModeRun` returns `null`.

The honest options, in preference order. **Pick one, justify it in the PR, and do
not silently take the cheapest:**

1. **Carry the door.** The manual-door save learns it came from the connected
   door and posts a close reason, so the stored row can say what it is. This is a
   write-path and stored-shape change — genuinely TRIAD, and the only option that
   fixes the STORED record as well as the live screen.
2. **Live screen only, stored row explicitly left wrong.** Correct what the rower
   sees at save time and accept that the stored row keeps reading
   `LOGGED BY HAND`. Cheaper, and **only acceptable if the PR states the
   consequence in plain words** rather than implying both screens are fixed.

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
3. The banner never claims to have kept anything when nothing was measured, and
   names no cause.
4. One exported predicate decides "measured anything", consumed by both the
   banner and the caption.
5. A connected session that recorded nothing does not present as hand-logged on
   the live summary; and the PR states plainly whether the STORED row is fixed
   too or left wrong.
6. All three exits still offered, `Log against plan` included and undemoted.
7. `endSession` closing nothing, and `monitorModeRun` returning null, each leave
   a ring entry naming why; the ring carries a wall clock.
8. **The §D1e probe is run and reported with FRAME COUNTS**, both with and
   without `bluetooth-central`, so a null result is distinguishable from an
   unrun probe. The report says which of §D1e's three outcomes occurred, and
   whether §D2a's drain inference held. No plist change is merged either way.
9. **A phone walk with two separate legs**, because they exercise different code:
   **lock BEFORE the first pull** (the nothing-measured branch, this spec's
   flagship) and **lock MID-PIECE** (the something-measured branch). A single leg
   reported as covering both is the oracle-blindness the anchor pass flagged.
   Requires a device build carrying the change; build 749 cannot show it.

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
