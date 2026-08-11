import type { NewsArticle } from "./types";
import { WorkoutTypesBody } from "./bodies/workoutTypes";
import { BaselinesBody } from "./bodies/baselines";
import { PickingAWorkoutBody } from "./bodies/pickingAWorkout";
import { PainScaleBody } from "./bodies/painScale";
import { YourFirstRowBody } from "./bodies/yourFirstRow";
import { ConnectTheMonitorBody } from "./bodies/connectTheMonitor";
import { NotationBody } from "./bodies/notation";

// Registry order is display order (pins first, then latest — within a tie
// on `publishedAt`, `latestArticles`' stable sort falls back to THIS array
// order, which is why new articles are appended after the existing ones:
// baselines/picking-a-workout must stay adjacent for `nextUnreadSlug`'s
// registry-order walk. Pinned rows are `pinnedArticles()`'s FILTER over
// this same order, so pins need not be adjacent — the PR #81 swap left
// workout-types at index 0 and pinned the appended shorthand article.)
// All seven are original prose — structurally informed by the source
// literature, never verbatim (Phase 6E's content discipline, binding per
// the 6H spec).
//
// `minutes` = ceil(rendered word count / 180) — 180 wpm is a deliberately
// unhurried silent-reading rate for this app's short-form prose, not a
// speed-reading estimate. Recount and update whenever a body's prose
// changes (persona-review fix wave, 2026-08-07): workout-types 449 words
// -> 3 min, baselines 451 words -> 3 min, picking-a-workout 286 words
// -> 2 min, pain-scale 366 words -> 3 min. Phase 6I Task 6 (2026-08-08):
// your-first-row 216 words -> 2 min, connect-the-monitor 190 words -> 2
// min — the design spec's own "~3 min" estimate for connect-the-monitor
// (written before the prose existed) is superseded by this real count;
// `StartHere.tsx`'s hardcoded minutes were updated to match. Recounted
// after the disconnect paragraph's redraft (same day, controller fix): 217
// words -> still 2 min, no further changes needed. ui-notes round
// (2026-08-09, item 3's two prose surgeries): your-first-row's replaced
// "Prefer the short test?" paragraph and baselines' one added sentence
// both grew their bodies — recounted at 256 words (your-first-row) and 476
// words (baselines, body + the IN THE APP aside together); both stay at
// their existing `minutes` value above (ceil(256/180)=2, ceil(476/180)=3),
// no registry or `StartHere.tsx` change needed this round.
export const ARTICLES: NewsArticle[] = [
  {
    slug: "workout-types",
    title: "The four workout types, and how hard each should feel",
    minutes: 3,
    kind: "first-party",
    pinned: true,
    publishedAt: "2026-08-07",
    typeChips: true,
    body: <WorkoutTypesBody />,
  },
  {
    // Unpinned 2026-08-11 (James, PR #81): reading-the-shorthand takes
    // this slot — scanning the Library is the skill the pin teaches now,
    // and baselines stays one tap away via the shorthand article's own
    // crosslink. Registry POSITION is unchanged (nextUnreadSlug's walk
    // and the baselines/picking-a-workout adjacency both key off order,
    // not the pinned flag).
    slug: "baselines",
    title: "What a baseline is, and why every pace comes from one",
    minutes: 3,
    kind: "first-party",
    pinned: false,
    publishedAt: "2026-08-07",
    body: <BaselinesBody />,
  },
  {
    slug: "picking-a-workout",
    title: "Picking a workout by how much it should hurt",
    minutes: 2,
    kind: "first-party",
    pinned: false,
    publishedAt: "2026-08-07",
    body: <PickingAWorkoutBody />,
  },
  {
    slug: "pain-scale",
    title: "The pain scale, without a heart rate monitor",
    minutes: 3,
    kind: "first-party",
    pinned: false,
    publishedAt: "2026-08-07",
    body: <PainScaleBody />,
  },
  {
    slug: "your-first-row",
    title: "Your first row",
    minutes: 2,
    kind: "first-party",
    pinned: false,
    publishedAt: "2026-08-08",
    body: <YourFirstRowBody />,
  },
  {
    slug: "connect-the-monitor",
    title: "Connect the monitor, and it drives the piece",
    minutes: 2,
    kind: "first-party",
    pinned: false,
    publishedAt: "2026-08-08",
    body: <ConnectTheMonitorBody />,
  },
  // Appended per the registry-order rule above: nextUnreadSlug's walk
  // stays untouched, and pinned rows render in registry order, so this
  // pin displays after workout-types. PINNED per James (PR #81, in
  // baselines' old slot): the Library-scanning skill is what the pinned
  // shelf teaches now. Persona round (novice/expert/PM, 2026-08-11):
  // 509 words -> 3 min.
  {
    slug: "reading-the-shorthand",
    title: "Reading the shorthand: scan the Library without opening a workout",
    minutes: 3,
    kind: "first-party",
    pinned: true,
    publishedAt: "2026-08-10",
    body: <NotationBody />,
  },
];

export function articleBySlug(slug: string): NewsArticle | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

export function pinnedArticles(): NewsArticle[] {
  return ARTICLES.filter((a) => a.pinned);
}

export function latestArticles(
  articles: NewsArticle[] = ARTICLES,
): NewsArticle[] {
  return articles
    .filter((a) => !a.pinned)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function unreadCount(readSlugs: ReadonlySet<string>): number {
  return ARTICLES.filter((a) => !readSlugs.has(a.slug)).length;
}

export function nextUnreadSlug(
  currentSlug: string,
  readSlugs: ReadonlySet<string>,
): string | null {
  const firstParty = ARTICLES.filter((a) => a.kind === "first-party");
  const at = firstParty.findIndex((a) => a.slug === currentSlug);
  for (let step = 1; step <= firstParty.length; step++) {
    const candidate = firstParty[(at + step) % firstParty.length]!;
    if (candidate.slug !== currentSlug && !readSlugs.has(candidate.slug)) {
      return candidate.slug;
    }
  }
  return null;
}
