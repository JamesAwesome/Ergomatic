import type { ReleaseNote } from "./types";

// Newest first. Seeded retroactively at the News tab's launch (6H spec);
// from here on, a release gets a note when it changes something a rower
// would notice, and internal-only releases are skipped.
export const RELEASE_NOTES: ReleaseNote[] = [
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
