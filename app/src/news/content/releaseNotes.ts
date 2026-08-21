import type { ReleaseNote } from "./types";

// Newest first. Seeded retroactively at the News tab's launch (6H spec);
// from here on, a release gets a note when it changes something a rower
// would notice, and internal-only releases are skipped.
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    // Phase LL spec 1 in one build: the boundary fold (#140), rests marked
    // (#141), the time axis + the 10,000m counter reserve + screenshot
    // determinism (#142), rests excluded from the pace scale + the TOTAL
    // LEFT -> EST LEFT rename (#143), and the countdown fix (#144). Range
    // v0.14.0..main, 11 commits, settled with `git log v0.14.0..main
    // --oneline` — WITHOUT `--merges`, which returns empty on this repo
    // because main is squash-merged (RF15, corrected at #144's PM re-gate;
    // the gate had been unrunnable as written for four tags).
    //
    // Six merges need no note and each has a reason: #133/#134 roadmap
    // structure, #135 CI, #137 a walk record, #138/#139 research docs —
    // not one line under `app/src/`.
    //
    // Item order is rower-priority: the trace items lead because that is
    // the screen he photographed, and the estimate follows because it is
    // the number he filed a bug about. The distance caveat rides INSIDE
    // the estimate item rather than becoming its own bullet (PM re-gate
    // ruling): he reported this exact symptom four days ago, and a
    // separate bullet reads as unrelated, which would make the residual
    // look like a failed fix.
    version: "v0.15.0",
    date: "2026-08-20",
    items: [
      "Your session's trace now has a time axis along the bottom, so you can see where you were in the row rather than just the shape of it. The pace labels down the side were being cut off and now read properly.",
      "Rests are drawn as rests. A small band on the axis marks where you stopped, and a rest no longer squashes the pace scale: on a session with real rests, your working intervals used to be a flat line across the top of the chart because the rest values stretched the axis. Now the scale comes from your rowing and the difference between your best and worst interval is actually visible.",
      "One honest note about older traces: a session recorded before this update can be missing a whole interval if the Bluetooth link stuttered, and it drew rests as though you were rowing. There is no way to tell a good old trace from a bad one, and they cannot be repaired. Traces recorded from this build on are trustworthy.",
      "TOTAL LEFT is now EST LEFT, and it keeps counting while you rest. It used to freeze whenever you stopped moving during a rest, because the erg's own clock stops with the flywheel, so a session with long rests finished reading about a minute high. It is still an estimate: on a distance piece rowed well off your target pace it can still pause for a few seconds going into the rest. That is measured and known, not the old bug.",
      "The meters counter on the connected screen no longer nudges the progress bar when a session passes 10,000m.",
    ],
  },
  {
    // Phase LT in one build: LT-0's discard fix (#128), spec 1's
    // targets/judgment/SPM (#129), spec 2's series capture (#130,
    // rower-invisible on its own and deliberately unnoted), and spec 3's
    // traces (#131). Range is v0.13.0..main, settled with `git merge-base
    // --is-ancestor` rather than a tag message (RF15). Item order is
    // rower-priority: the judgment change leads because it changes what a
    // COLOR means on a screen testers already read, and the history line
    // rides directly under it because rows they have already seen will
    // change tone without them touching anything. #124's "no way to fix a
    // session's numbers" gap was already announced in v0.13.0 and is not
    // repeated. The trace item names the old-session limit in the same
    // sentence, the v0.12.0 old-corpus precedent.
    version: "v0.14.0",
    date: "2026-08-20",
    items: [
      "Your interval rows now answer the question you actually asked: did I hit MY target. Each measured row shows its target beside what you rowed and is judged against that target, not against the session's own average. Faster is blue, slower is red, and anything inside half a second of the target is on target: plain ink, no verdict.",
      "That also re-reads your history. Open a session you have looked at before and its rows may have changed color, because they are being judged by the new rule. A workout that beat every target used to paint its slowest rows red simply for being slower than the others. Those rows are blue now.",
      "Stroke rate is on the rows at last, written as 24 / 22: what you actually pulled, then the rate the workout asked for.",
      "Every screen that offers to save a session now also offers to discard it. The by-hand door was the last one that could trap you in a row you did not want.",
      "Connected sessions draw their own trace under the interval list: your pace across the whole row, with stroke rate and heart rate a tap away. Heart rate appears only if a belt was on the wire. Sessions rowed before this update kept no trace and show no chart, so the first row you take after updating is the first one with a picture.",
    ],
  },
  {
    // Phase CM (#123): the session meters counter and the interval's own
    // average on the connected LIVE pane, hardware-verified (the exit walk
    // photographed monitor, live counter and summary agreeing sub-metre).
    // The two rules a rower cannot learn from the screen are stated in
    // plain words per the PM final gate: the colour appears only at rest
    // (the average is not true until an interval is nearly done), and a
    // rest-free piece never shows it. The counter steps in 5m increments
    // by James's calm rule, measured rather than guessed (the antagonist's
    // jitter pass). The swipe line closes the walk's finding: WebKit
    // cancels off-horizontal drags inside a scrolling grid; flat drags
    // page. No "check them side by side" promise of exact agreement - the
    // live cell is quantised, the summary is exact.
    version: "v0.13.0",
    date: "2026-08-18",
    items: [
      "The connected screen counts your meters again: the whole session, work and rest, at the end of the progress bar. It moves in calm 5-meter steps; the summary at the end keeps the exact figure, and both were checked against the erg's own monitor in the same photo frame.",
      "Your interval's average split now sits beside its target, under the big split. While you row it stays plain ink: an average spends most of an interval climbing from the standing start, so a verdict mid-interval would just say SLOWER at you. The moment the rest begins, it turns blue or red against the interval you just finished.",
      "That also means a piece with no rests never shows the color, and neither does a session's final interval: the summary is where those verdicts live, every interval judged in its list.",
      "About the swipe, from this week's erg session: a drag inside the scrolling interval list needs to be genuinely flat, or iOS takes it for a scroll. Drag level, or use the LIVE/GRID buttons, which always work.",
      "You can delete a wrong session. Open any session and scroll to the bottom: a duplicate, a test row, or a botched save stops existing rather than being rewritten. Deleting your most recent plan session also un-ticks its checkmark, so it stops counting as training you did; deleting older history leaves your plan's numbering alone.",
      "One thing that does not exist yet: fixing a session's numbers. If a row is wrong, the only remedy is to delete it and log it again, which stamps today's date.",
    ],
  },
  {
    // Phase PW spec 2 (#121, the history + first edit) plus Phase CS's
    // swipe (#119) — CS's own gate asked for a v0.11.1 that was never cut,
    // so its notes ride here, including the gate's explicit ask that the
    // notes probe whether swipe was found unaided. #120 (walk tooling) is
    // not rower-visible and is skipped per the internal-only rule. The
    // old-corpus item is the PM final-PR gate's condition: an
    // additive-only migration means every pre-update session renders
    // hero-less, and the notes say so in one plain sentence rather than
    // letting a tester file it as a bug.
    version: "v0.12.0",
    date: "2026-08-18",
    items: [
      "Your history is open. Today's LAST THREE heading now leads to every session you have ever logged, newest first, and tapping any session shows what you saw when you finished it: the same top numbers, the same interval list, the same colors.",
      "The reflection you skipped can finally be answered. Open any past session and tap Edit: thumbs, the hold question, pain, and notes are all editable, and clearing an answer works the same way it does when logging.",
      "Plan checkmarks open their sessions. A completed plan session links to the exact log it recorded, and resetting your plan never rewrites what a checkmark already says.",
      "One honest note about your existing sessions: anything logged before this update keeps its rows and reflection but shows no top-line numbers, and its plan checkmark stays plain. The first session you row after updating is the first with the full record.",
      "You can swipe between LIVE and GRID on the connected screen now, including drags that start on the interval rows. If you already found the swipe before reading this, tell us: whether it was discoverable unaided is exactly what we want to know.",
    ],
  },
  {
    // Phase PW spec 1 (#117): the post-workout summary replaces the whole
    // post-row flow, plus the connected footer's richer NEXT line (#116,
    // Phase CS task 1-3 — its phase continues, but the change ships in
    // this build so it is noted here, not re-noted later). v0.10.1 (#113,
    // the null-tolerant read) was internal-only and folds in silently.
    // Item order is rower-priority: the summary leads, the two number
    // corrections ride directly under it because this build changes what
    // TIME and DISTANCE mean, and the notes rule from the v0.10.0 gate
    // holds — a number that reads differently must say where to look.
    version: "v0.11.0",
    date: "2026-08-17",
    items: [
      "Finishing a session lands on a summary now: your average split, total meters, and time up top, every interval listed under them. It replaces the old log screen on every door, connected, timer, and by hand.",
      "Connected times read lower, and truer. TIME counts the work you rowed plus the rests you completed, never the clock on the wall. Leave mid-session and come back later, and it still says what you actually rowed.",
      "Total meters is back, and it is the erg's own number. DISTANCE counts everything the flywheel counted, warm-up and rest meters included, so it should match the monitor exactly. Check them side by side after any session.",
      "Each measured interval shows how far it sat from your session's own average: blue bar faster, red slower. A session with a single measured interval shows no bar, because there is nothing real to compare it against.",
      "The hold question says which direction it means now: HELD, UNDER · FASTER, OVER · SLOWER. A thumbs up or down joins it, asking whether you want more sessions like this one.",
      "The whole reflection is optional. Save the row and answer nothing, or clear any answer with a second tap. One honest caveat: there is no way to come back and fill it in later yet.",
      "The connected footer's NEXT line tells you what you are about to row: the distance or time, the target split, and the stroke rate, instead of just naming the phase.",
    ],
  },
  {
    // Phase CR2 in one build: the totals corrections (#99, #104), the
    // state-honesty wave (#102, #105, #111), the redesign (#109), and the
    // builder nudge fix (#108). Item order is rower-priority. The totals
    // item leads and names WHERE to check, because the same build removes
    // the live TOTAL M readout the old number lived in — a tester told
    // "lower and correct" with nowhere to look would file it as a
    // regression (phase-close gate, 2026-08-16). Wire-walk-confirmed on a
    // real PM5 (2026-08-17): keystone totals within 0.2m, the rest fix
    // firing live, the interrupted-session row landing after a real
    // mid-piece reload.
    version: "v0.10.0",
    date: "2026-08-17",
    items: [
      "Connected session totals are correct now, and lower. Two counting bugs each inflated the total meters on interval workouts with rests; both are fixed, so the number you see should finally match the erg's own. Check it on the log screen after a session, or in the diagnostics sheet's SESSION line mid-row.",
      "The connected screen is rebuilt around two big judged numbers. Everything the PM5 already shows in the same glance left the phone: the interval countdown, running meters, and raw heart rate now live on the GRID view, one tap away on the new LIVE and GRID switch at the top (bottom bar in portrait).",
      "Before your first stroke the screen says READY, shows your target as a ghost, and a session bar draws every interval to scale so you can see the whole piece at a glance.",
      "The bottom line always tells you what is next: NEXT, then the piece or the rest, and NEXT FINISH when it is the last one.",
      "Stopping mid-piece reads honestly. The screen says PULL TO RESUME, nothing more: the erg has no pause and its clock keeps running, and the app stopped pretending otherwise.",
      "A reload or crash mid-session no longer strands your row. Today shows the interrupted session with Log it and Discard, and Log it records the time you actually rowed, never the time the app was closed.",
      "Connect and Start stopped warning that a session is in progress when what you have is an unlogged one. The buttons now say what will actually happen.",
      "In the builder, the pace nudge arrows follow the number: up makes the number bigger, down smaller, whichever field you are in.",
    ],
  },
  {
    // The connected-mode revamp (#89) plus the two that landed beside it,
    // the Library's filter unification (#87) and the article-state fix
    // (#88). Item order is rower-priority, not merge order. Every
    // connected item here is walk-confirmed on a real PM5 (2026-08-13):
    // the column holding still through a rotation, the notches landing on
    // a real boundary, the warm-up reading WARM-UP and then 1 OF 2, and
    // both heroes legible at arm's length mid-stroke. The countdown and
    // finish-screen line is the one item that needs no monitor at all.
    version: "v0.9.0",
    date: "2026-08-13",
    items: [
      "Connected mode is two screens instead of three. Live shows your split and your stroke rate as two big numbers, each sitting directly over the target it is judged against.",
      "Faster than your target reads blue, slower reads red, on the split and the rate alike.",
      "Your warm-up is flagged as one. It says WARM-UP while you row it, and the interval count starts at your first working piece, so a two piece workout no longer tells you it is one of three before you have begun.",
      "The progress bar is notched where your intervals actually change, so you can see where you are in the session without reading a number.",
      "The grid gives every interval a single line: eight of them visible in landscape, fifteen in portrait.",
      "End session moved to the top corner. It used to be a full width bar directly under the pane switcher, easy to catch with a thumb reaching to change views mid row.",
      "Connected mode in landscape uses the whole screen.",
      "The countdown and the finish screen stopped scrolling on phones with a notch. That one needs no monitor.",
      "The Library filters by difficulty now, and the workout type chips sit outside the filter sheet where one tap reaches them.",
    ],
  },
  {
    // The fast-follow wave plus everything that shipped after v0.7.0's own
    // entry was written (#80/#81/#83). Item order is rower-priority, not
    // merge order. The connected-screen items are all walk-confirmed on a
    // real PM5 (2026-08-11): 2 of 2 intervals measured, one door to the
    // countdown, the screen staying lit hands-off.
    version: "v0.8.0",
    date: "2026-08-11",
    items: [
      "The screen stays awake while you row a connected piece. It used to sleep mid-row once your hands were on the handle.",
      "Starting a workout is one door now, and your pace adjustment sticks. The old confirm screen is gone: adjust pace on the workout page and start, and the same adjustment carries through whether you connect a PM5 or use the phone timer.",
      "Connect is blue and sits above Start Timer, the workout page's one clear way to begin a monitored row.",
      "A connected session survives a dropped reading. If the monitor's final interval data never arrives, the app recovers that interval's time and meters from the workout summary whenever the numbers add up, and leaves it blank rather than guessing when they don't.",
      "Workouts show their real shape: each piece as its own row, the hardest one tinted, and repeated pieces collapsed to one line like 5x the block below.",
      "New in News: an article decoding the Library's shorthand, line by line.",
    ],
  },
  {
    // Covers everything since v0.5.1: v0.6.0 shipped without an entry, so
    // this one carries the 6I onboarding alongside the warmup setting and
    // the Phase CL fixes (James's ruling, 2026-08-09). The tag-time touch
    // happened 2026-08-11: the date, and the PM5 line rewritten from
    // "phone support is on the way" after the phone-BLE phase merged the
    // same morning the tag was cut. The library also rebalanced between
    // the entry's drafting and the tag (PR #78), worth its own line.
    version: "v0.7.0",
    date: "2026-08-11",
    items: [
      "Connect a PM5 from a workout's page and row with live splits, on your phone or in a desktop browser.",
      "Today now starts you off: a START HERE guide walks your first week, and a baseline-setting workout appears until your 2k and 6k are in.",
      "Workouts no longer carry their own warm-ups. Set yours once on You and every session includes it automatically.",
      "The library rebalances around the 30 to 45 minute middle: most workouts got a little longer, and eleven were replaced outright.",
      "New in News: articles on setting baselines and picking a workout, plus a Start here shelf for new rowers.",
      "Reading flows properly now: BACK walks you through the articles you came from, and the close button returns you to where you started.",
      "The News feed remembers your scroll position.",
      "Bulk import is all-or-nothing: a bad line means nothing lands, so fixing and re-pasting never duplicates workouts.",
    ],
  },
  {
    version: "v0.5.1",
    date: "2026-08-04",
    items: [
      "Today's filters now open from one FILTER control, the same sheet the Library uses.",
    ],
  },
  {
    version: "v0.5.0",
    date: "2026-08-04",
    items: [
      "The library grows from 35 workouts to 300, across every type and duration.",
      "One button language across the app, and every pace now shows as a single exact target instead of a range.",
      "The Library's filters move into a sheet, with pain filterable level by level.",
    ],
  },
  {
    version: "v0.4.0",
    date: "2026-08-02",
    items: [
      "The whole loop closes: Today suggests, Confirm adjusts, the timer runs the piece, and the log writes it down.",
      "Rowing a plan day as a different type no longer abandons the plan, and a session can be logged outside the plan.",
    ],
  },
];
