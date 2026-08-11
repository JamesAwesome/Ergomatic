import type { ReleaseNote } from "./types";

// Newest first. Seeded retroactively at the News tab's launch (6H spec);
// from here on, a release gets a note when it changes something a rower
// would notice, and internal-only releases are skipped.
export const RELEASE_NOTES: ReleaseNote[] = [
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
