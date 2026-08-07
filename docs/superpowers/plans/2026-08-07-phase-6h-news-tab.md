# Phase 6H — News Tab Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The TREND placeholder tab becomes NEWS — a reading surface with four
bundled explainer articles, an in-app reader, per-user read state, and release
notes.

**Architecture:** Articles are typed TSX modules bundled in the client (no
CMS); the only server work is one additive `article_reads` table with two
additive routes. New screens (`/news`, `/news/:slug`, `/news/releases`) follow
the existing screen/hook idioms exactly.

**Tech Stack:** React 19 + react-router, Express 5 + Drizzle, Vitest
three-project setup, Playwright e2e. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-07-phase-6h-news-tab-design.md` —
read it before starting any task.

## Global Constraints

- Work in the worktree `.claude/worktrees/news-tab`, branch
  `phase-6h-news-tab`. **Run `git rev-parse --show-toplevel` before every
  commit** and confirm it prints the worktree path.
- All commands run in `app/` unless stated. pnpm only, ESM only, server
  imports use `.js` extensions.
- TDD: failing test first, every task.
- **No level-1 button (`.button-l1`) anywhere under `/news`** — accent on
  News means only: unread squares, durations, text links (spec, design §2).
- Pain is **1–5** in every article; the book's 1–10 scale never appears.
  House time format (`0:45`, `20:00`) and `m:ss.d` splits in all prose.
- Colors/type via existing tokens only (`tokens.css`) — the design's
  secondary ink `#57544c` IS `--ink-3`; never a raw hex in components.
- 44px hit targets and WCAG AA (4.5:1) are hard requirements; compute
  ratios, don't eyeball (CLAUDE.md recurring-failure #6).
- If your diff touches `app/src/`, run `pnpm e2e` before reporting done;
  `pnpm screenshots` too when a screen's layout changed.
- Check per-file coverage for files you touched, not the aggregate gate.
- API changes additive-only; the two new routes must not alter any existing
  route's behavior.

## File Structure

```
app/server/db/schema.ts                      modify  + articleReads table
app/drizzle/0004_*.sql                       generated migration
app/server/stores/articleReads.ts            new     store factory
app/server/stores/stores.integration.test.ts modify  real-store integration tests
app/server/testing/fakes.ts                  modify  fake articleReads store
app/server/routes/data.ts                    modify  Stores + GET/PUT routes
app/server/routes/data.test.ts               modify  route tests
app/server/routes/isolation.integration.test.ts modify per-user isolation
app/server/index.ts                          modify  wire store
app/src/news/content/types.ts                new     NewsArticle/ReleaseNote types
app/src/news/content/articles.tsx            new     registry + selectors
app/src/news/content/bodies/*.tsx            new     4 article bodies
app/src/news/content/releaseNotes.ts         new     seeded notes
app/src/news/content/articles.test.tsx       new     invariants + selectors
app/src/api/useArticleReads.ts (+ .test.ts)  new     read-state hook
app/src/news/News.tsx (+ .test.tsx)          new     the tab screen
app/src/news/Reader.tsx (+ .test.tsx)        new     /news/:slug
app/src/news/Releases.tsx (+ .test.tsx)      new     /news/releases
app/src/news/newsDates.ts (+ test)           new     masthead/date helpers
app/src/shell/TabBar.tsx (+ test)            modify  TREND→NEWS, order
app/src/shell/AppRoutes.tsx (+ test)         modify  routes
app/src/index.css                            modify  .news-* / .reader-* rules
app/e2e/news.spec.ts                         new     flow: read persists
app/e2e/design.spec.ts                       modify  structural sweeps
app/e2e/screenshots.spec.ts                  modify  news, news-reader
docs/design/DEVIATIONS.md, docs/design/README.md, ROADMAP.md   modify
```

---

### Task 1: `article_reads` — schema, migration, store

**Files:**
- Modify: `app/server/db/schema.ts` (append after `testHistory`)
- Create: `app/server/stores/articleReads.ts`
- Modify: `app/server/stores/stores.integration.test.ts` (append a describe
  block; copy the harness idiom already in the file)
- Modify: `app/server/stores/contracts/` per docs/TESTING.md's contract-test
  rule — the fake (Task 2) and the real store must pass one shared contract
  suite; follow the structure the existing contracts use
- Generated: `app/drizzle/0004_<name>.sql` via `pnpm db:generate`

**Interfaces:**
- Consumes: `Db` from `../db/index.js`, `users` from `../db/schema.js`
- Produces (Task 2 depends on these exact names):
  ```ts
  export function createArticleReadsStore(db: Db): {
    list(userId: string): Promise<string[]>;              // slugs, any order
    markRead(userId: string, slug: string): Promise<void>; // idempotent
  };
  export type ArticleReadsStore = ReturnType<typeof createArticleReadsStore>;
  ```

- [ ] **Step 1: Write the failing integration tests** (append to
  `stores.integration.test.ts`, using the file's existing db/user fixtures):

```ts
describe("articleReads store", () => {
  it("lists nothing for a user with no reads", async () => {
    expect(await stores.articleReads.list(userA)).toEqual([]);
  });

  it("markRead then list round-trips the slug", async () => {
    await stores.articleReads.markRead(userA, "workout-types");
    expect(await stores.articleReads.list(userA)).toEqual(["workout-types"]);
  });

  it("markRead is idempotent and keeps the original read_at", async () => {
    await stores.articleReads.markRead(userA, "baselines");
    const before = await readAtOf(userA, "baselines"); // raw select via db
    await stores.articleReads.markRead(userA, "baselines");
    expect(await stores.articleReads.list(userA)).toEqual(["baselines"]);
    expect(await readAtOf(userA, "baselines")).toEqual(before);
  });

  it("reads are per-user", async () => {
    await stores.articleReads.markRead(userA, "pain-scale");
    expect(await stores.articleReads.list(userB)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test --project integration` (needs Docker; Testcontainers boots
Postgres). Expected: FAIL — `articleReads` store does not exist.

- [ ] **Step 3: Add the table to `schema.ts`** (append; `primaryKey` joins
  the existing `drizzle-orm/pg-core` import):

```ts
// --- Phase 6H: News read state ------------------------------------------

// No FK to content: articles are bundled in the client, so a slug unknown
// to the current bundle is simply ignored at display time (a rollback
// keeps its reads). Composite PK makes markRead an idempotent no-op insert.
export const articleReads = pgTable(
  "article_reads",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    readAt: timestamp("read_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.slug] })],
);
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm db:generate` → creates `app/drizzle/0004_*.sql`. Open it and
confirm it ONLY creates `article_reads` (additive — no other table touched).

- [ ] **Step 5: Write the store**, `app/server/stores/articleReads.ts`:

```ts
import { eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { articleReads } from "../db/schema.js";

export function createArticleReadsStore(db: Db) {
  return {
    async list(userId: string): Promise<string[]> {
      const rows = await db
        .select({ slug: articleReads.slug })
        .from(articleReads)
        .where(eq(articleReads.userId, userId));
      return rows.map((r) => r.slug);
    },

    // Idempotent: a second read of the same article keeps the first read_at.
    async markRead(userId: string, slug: string): Promise<void> {
      await db
        .insert(articleReads)
        .values({ userId, slug })
        .onConflictDoNothing();
    },
  };
}

export type ArticleReadsStore = ReturnType<typeof createArticleReadsStore>;
```

- [ ] **Step 6: Run tests to verify pass**

Run: `pnpm test --project integration`. Expected: PASS (all pre-existing
integration tests still green too).

- [ ] **Step 7: Commit**

```bash
git rev-parse --show-toplevel   # must print .../worktrees/news-tab
git add ../app/server/db/schema.ts ../app/server/stores/articleReads.ts \
  ../app/server/stores/stores.integration.test.ts ../app/drizzle
git commit -m "feat: article_reads — the table that remembers what you read"
```

---

### Task 2: the two routes, the fake, the wiring

**Files:**
- Modify: `app/server/routes/data.ts` (Stores interface + two routes)
- Modify: `app/server/testing/fakes.ts` (fake articleReads store)
- Modify: `app/server/routes/data.test.ts` (route tests)
- Modify: `app/server/routes/isolation.integration.test.ts` (per-user pin)
- Modify: `app/server/index.ts` (construct + pass the store)
- Modify: contract suite from Task 1 so the fake passes it too

**Interfaces:**
- Consumes: `ArticleReadsStore` (Task 1)
- Produces (Tasks 4/7 depend on these exact shapes):
  - `GET /api/article-reads` → `200 {"slugs": string[]}`
  - `PUT /api/article-reads/:slug` → `204` empty; `400 {"error": ...}` on a
    slug failing `SLUG_RE`; both behind `requireUser` like every data route

- [ ] **Step 1: Write the failing route tests** (append to `data.test.ts`,
  using its `makeStores`/app-harness idiom — read the file's existing
  `/api/prefs` tests first and copy their setup exactly):

```ts
describe("article reads", () => {
  it("GET returns an empty list for a fresh user", async () => {
    const res = await agent.get("/api/article-reads");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ slugs: [] });
  });

  it("PUT then GET round-trips; PUT is idempotent", async () => {
    expect((await agent.put("/api/article-reads/workout-types")).status).toBe(204);
    expect((await agent.put("/api/article-reads/workout-types")).status).toBe(204);
    const res = await agent.get("/api/article-reads");
    expect(res.body).toEqual({ slugs: ["workout-types"] });
  });

  it("rejects a slug outside the safe shape", async () => {
    for (const bad of ["UPPER", "a b", "a/../b", "x".repeat(65), "é"]) {
      const res = await agent.put(`/api/article-reads/${encodeURIComponent(bad)}`);
      expect(res.status).toBe(400);
    }
  });

  it("requires a session", async () => {
    // copy the file's existing unauthenticated-request idiom
    expect((await anonAgent.get("/api/article-reads")).status).toBe(401);
    expect((await anonAgent.put("/api/article-reads/x")).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test --project unit` (data.test.ts runs against fakes).
Expected: FAIL — fakes and routes don't exist. (Compilation will fail on the
missing `articleReads` member first; that IS the failing state.)

- [ ] **Step 3: Implement.** In `data.ts`: add to the `Stores` interface
  (`articleReads: ArticleReadsStore;` + type import); add near the other
  regexes:

```ts
// Conservative slug shape, validated here rather than against the bundled
// registry: client and server versions may skew mid-deploy, and an unknown
// slug is harmless — it's ignored at display time.
const SLUG_RE = /^[a-z0-9-]{1,64}$/;
```

and the routes (place after the `/api/prefs` pair):

```ts
router.get("/api/article-reads", async (req, res) => {
  res.json({ slugs: await stores.articleReads.list(req.user!.id) });
});

router.put("/api/article-reads/:slug", async (req, res) => {
  const { slug } = req.params;
  if (!SLUG_RE.test(slug)) {
    badRequest(res, "slug must match ^[a-z0-9-]{1,64}$", "slug");
    return;
  }
  await stores.articleReads.markRead(req.user!.id, slug);
  res.status(204).end();
});
```

In `testing/fakes.ts`, add a Map-backed fake with the same idempotency
semantics (`Map<userId, Set<slug>>`), registered in `makeFakeStores`. Wire
the contract suite from Task 1 to run against it. In `server/index.ts`,
construct `createArticleReadsStore(db)` and add it to the `stores` object.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test --project unit && pnpm test --project integration`.
Expected: PASS. Then add to `isolation.integration.test.ts` (its existing
two-user idiom): user A's PUT never appears in user B's GET — run
integration again, PASS.

- [ ] **Step 5: Commit**

```bash
git rev-parse --show-toplevel
git add -A ../app/server
git commit -m "feat: GET/PUT article-reads — additive routes, session-guarded"
```

---

### Task 3: the content — types, registry, four articles, release notes

**Files:**
- Create: `app/src/news/content/types.ts`
- Create: `app/src/news/content/bodies/workoutTypes.tsx`, `baselines.tsx`,
  `pickingAWorkout.tsx`, `painScale.tsx`
- Create: `app/src/news/content/articles.tsx` (registry + selectors)
- Create: `app/src/news/content/releaseNotes.ts`
- Create: `app/src/news/content/articles.test.tsx`

**Interfaces:**
- Produces (Tasks 4–7 depend on these exact names):

```ts
// types.ts
import type { ReactNode } from "react";

export type ArticleKind = "first-party" | "linked";

export interface LinkedSource {
  url: string;
  sourceName: string;   // e.g. "ROWING NEWS"
  commentary: string;   // our italic Newsreader note
}

export interface NewsArticle {
  slug: string;
  title: string;
  minutes: number;
  kind: ArticleKind;
  pinned: boolean;
  publishedAt: string;      // ISO yyyy-mm-dd
  updatedAt?: string;
  body?: ReactNode;         // first-party only
  linked?: LinkedSource;    // linked only
  typeChips?: boolean;      // pinned types row carries O2/AT/TR/AN chips
}

export interface ReleaseNote {
  version: string;          // a real annotated tag, e.g. "v0.5.1"
  date: string;             // ISO yyyy-mm-dd
  items: string[];
}
```

```ts
// articles.tsx
export const ARTICLES: NewsArticle[];                       // registry order = display order
export function articleBySlug(slug: string): NewsArticle | undefined;
export function pinnedArticles(): NewsArticle[];            // pinned, registry order
export function latestArticles(): NewsArticle[];            // unpinned, newest publishedAt first (registry order tiebreak)
export function unreadCount(readSlugs: ReadonlySet<string>): number;  // over ALL articles
export function nextUnreadSlug(
  currentSlug: string,
  readSlugs: ReadonlySet<string>,
): string | null;  // first-party only, registry order after current, wrapping; null when none
```

```ts
// releaseNotes.ts
export const RELEASE_NOTES: ReleaseNote[];                  // newest first
```

- [ ] **Step 1: Write the failing invariant/selector tests**
  (`articles.test.tsx`):

```tsx
import { describe, expect, it } from "vitest";
import {
  ARTICLES, articleBySlug, latestArticles, nextUnreadSlug,
  pinnedArticles, unreadCount,
} from "./articles";
import { RELEASE_NOTES } from "./releaseNotes";

describe("article registry invariants", () => {
  it("slugs are unique and safe-shaped", () => {
    const slugs = ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]{1,64}$/);
  });

  it("pins at most 3 (handoff open question #2: five pushes LATEST below the fold)", () => {
    expect(pinnedArticles().length).toBeLessThanOrEqual(3);
  });

  it("kind and payload agree: first-party has body xor linked has source", () => {
    for (const a of ARTICLES) {
      if (a.kind === "first-party") {
        expect(a.body, a.slug).toBeTruthy();
        expect(a.linked, a.slug).toBeUndefined();
      } else {
        expect(a.linked, a.slug).toBeTruthy();
        expect(a.body, a.slug).toBeUndefined();
      }
    }
  });

  it("every article reads in at least a minute", () => {
    for (const a of ARTICLES) expect(a.minutes).toBeGreaterThanOrEqual(1);
  });

  it("launch shelf: the two permanent pins plus two latest stories", () => {
    expect(pinnedArticles().map((a) => a.slug)).toEqual([
      "workout-types", "baselines",
    ]);
    expect(latestArticles().map((a) => a.slug)).toEqual([
      "picking-a-workout", "pain-scale",
    ]);
  });
});

describe("selectors", () => {
  it("articleBySlug finds by slug and misses honestly", () => {
    expect(articleBySlug("baselines")?.title).toMatch(/baseline/i);
    expect(articleBySlug("nope")).toBeUndefined();
  });

  it("unreadCount counts every unread article, read ones drop out", () => {
    expect(unreadCount(new Set())).toBe(ARTICLES.length);
    expect(unreadCount(new Set(["baselines"]))).toBe(ARTICLES.length - 1);
    expect(unreadCount(new Set(ARTICLES.map((a) => a.slug)))).toBe(0);
  });

  it("nextUnreadSlug walks registry order, wraps, and returns null when done", () => {
    expect(nextUnreadSlug("workout-types", new Set())).toBe("baselines");
    // wraps past the end back to the top
    expect(nextUnreadSlug("pain-scale", new Set(["baselines", "picking-a-workout"])))
      .toBe("workout-types");
    // everything else read → nothing to offer
    const allButCurrent = new Set(
      ARTICLES.filter((a) => a.slug !== "pain-scale").map((a) => a.slug),
    );
    expect(nextUnreadSlug("pain-scale", allButCurrent)).toBeNull();
  });
});

describe("release notes", () => {
  it("newest first, every entry has a version tag shape and items", () => {
    const dates = RELEASE_NOTES.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const r of RELEASE_NOTES) {
      expect(r.version).toMatch(/^v\d+\.\d+\.\d+$/);
      expect(r.items.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test --project client -- src/news`. Expected: FAIL (modules
don't exist).

- [ ] **Step 3: Implement types.ts, the four bodies, the registry, the
  notes.** Registry:

```tsx
// articles.tsx
import type { NewsArticle } from "./types";
import { WorkoutTypesBody } from "./bodies/workoutTypes";
import { BaselinesBody } from "./bodies/baselines";
import { PickingAWorkoutBody } from "./bodies/pickingAWorkout";
import { PainScaleBody } from "./bodies/painScale";

// Registry order is display order (pins first, then latest). All four are
// original prose — structurally informed by the source literature, never
// verbatim (Phase 6E's content discipline, binding per the 6H spec).
export const ARTICLES: NewsArticle[] = [
  {
    slug: "workout-types",
    title: "The four workout types, and how hard each should feel",
    minutes: 4,
    kind: "first-party",
    pinned: true,
    publishedAt: "2026-08-07",
    typeChips: true,
    body: <WorkoutTypesBody />,
  },
  {
    slug: "baselines",
    title: "What a baseline is, and why every pace comes from one",
    minutes: 3,
    kind: "first-party",
    pinned: true,
    publishedAt: "2026-08-07",
    body: <BaselinesBody />,
  },
  {
    slug: "picking-a-workout",
    title: "Picking a workout by how much it should hurt",
    minutes: 3,
    kind: "first-party",
    pinned: false,
    publishedAt: "2026-08-07",
    body: <PickingAWorkoutBody />,
  },
  {
    slug: "pain-scale",
    title: "The pain scale, without a heart rate strap",
    minutes: 4,
    kind: "first-party",
    pinned: false,
    publishedAt: "2026-08-07",
    body: <PainScaleBody />,
  },
];

export function articleBySlug(slug: string): NewsArticle | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

export function pinnedArticles(): NewsArticle[] {
  return ARTICLES.filter((a) => a.pinned);
}

export function latestArticles(): NewsArticle[] {
  return ARTICLES.filter((a) => !a.pinned).sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
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
```

Bodies are plain components returning `<>` fragments of `<p>`, `<h2>`, and
(optionally) `<aside className="reader-inset">` — classes styled in Task 6.
**Use this exact prose** (James reviews it in the PR diff; do not rewrite):

`bodies/workoutTypes.tsx` — `export function WorkoutTypesBody()`:

> Every workout in the library carries a type chip: O2, AT, TR or AN. The
> chip isn't decoration — it names the job that workout does, and each job
> feels different from the inside.
>
> **O2 — general endurance.** Steady rowing at a moderate effort, usually
> thirty minutes or more. You should be able to hold a conversation. Nothing
> about an O2 piece feels impressive while you're doing it, which is exactly
> the point: this is the work that builds the engine everything else
> borrows from. Most of your metres should be O2 metres.
>
> **AT — threshold.** Moderate intervals with roughly as much rest as work.
> AT pieces live at an odd, specific effort: you could still speak, but
> you'd rather not — conversational pace and totally out of breath at the
> same time. The job is to find the line where your body stops keeping up
> with the effort, and to row just under it for longer each time.
>
> **TR — hard intervals.** Short, high-intensity pieces with rests around
> three times the work. TR exists to put you past the threshold on purpose,
> teach your body to deal with the build-up, and teach you to keep rowing
> through it. These are as much mental as physical.
>
> **AN — speed.** Very short bursts — half a minute to a minute and a half —
> with long rests, four or five times the work. AN is never about
> endurance. It's about power and turning your top speed up.
>
> **The pyramid.** Stack the four types by how much of your training each
> should get and you get a pyramid: a wide O2 base, a solid band of AT, a
> thinner band of TR, and a small AN tip. That shape is the whole training
> philosophy in one picture. The base carries the tip — hard intervals only
> translate into speed when there's an aerobic engine underneath them, and
> piling on intensity without the base is how plateaus and injuries happen.
> If a week of suggestions looks suspiciously gentle, that's not the app
> going easy on you. That's the pyramid.
>
> One honest caveat: the types blur at the edges. A hard interval session
> for a fit rower can be a threshold piece for a newer one. That's why every
> workout also carries a difficulty and an expected pain — the type names
> the job; the other two say how big it is.

`bodies/baselines.tsx` — `export function BaselinesBody()`:

> Every pace in this app is written relative to you. A workout never says
> "row 2:00.0" — it says something like 6k −2: two seconds per 500 m faster
> than your 6k pace. That 6k pace is a baseline, and once yours is set,
> every offset in the library resolves into a real number.
>
> A baseline is nothing more than the average split you can hold for the
> distance. Row a 6k; whatever your average split turns out to be, that's
> your 6k baseline. There is no test protocol to get right and no way to
> fail it. Row it how it feels.
>
> <aside className="reader-inset">IN THE APP — 6K 2:02.4 → O2 AT 6K −2 =
> 2:00.4. Every target carries the offset it came from, so you can always
> tell where a number was born.</aside>
>
> Why offsets instead of fixed paces? Because fitness moves. When your
> baseline improves, every workout in the library gets faster with you — the
> same piece that resolved to 2:00.4 in March might resolve to 1:58.9 by
> June, with nobody editing anything. Your history stays honest too: when
> you log a session, the app freezes the resolved numbers into the log, so
> an old entry always shows the paces you actually rowed against, not
> today's.
>
> There are two baselines, 2k and 6k, and they are deliberately separate. A
> 2k describes what you can do flat out; a 6k describes what you can
> sustain. They move at different rates and they answer different
> questions, so short, sharp workouts key off your 2k and longer ones key
> off your 6k. Keep both current and every workout in the library speaks
> your language.
>
> Don't overthink the first one. An honest, unheroic 6k this week beats a
> perfect one someday. You can re-row it whenever fitness (or honesty)
> demands.

`bodies/pickingAWorkout.tsx` — `export function PickingAWorkoutBody()`:

> Standing in front of a library of three hundred workouts, you need
> answers to exactly three questions. How much time do I have? What kind of
> work does my week need? And how much should today hurt?
>
> The first two are mechanical. Time is time — the library shows each
> workout's length, and the filters cut to what fits. Type follows the
> pyramid: if most of your recent rows were already hard, today probably
> isn't the day for more; if everything lately has been steady O2, a
> threshold or interval piece earns its place.
>
> The third question is what the pain figure is for. Every workout carries
> an expected pain from 1 to 5 — a forecast of how much the piece asks of
> you, not how complicated it is. Difficulty (easy, medium, hard) is a
> separate figure and answers a separate question: how much skill and
> structure the workout demands. A long steady row can be easy AND a 2, and
> a short set of sprints can be easy AND a 4. Longer never automatically
> means more painful — some of the gentlest sessions in the library are the
> longest.
>
> Today's suggestion already thinks this way. It reads your preferences,
> your time cap, and what you've rowed lately, then offers something that
> fits; the filters on Today let you narrow it further on the spot. The
> library is there when you'd rather choose by hand.
>
> The honest heuristic: most days, pick something you can finish well. A
> workout you complete at its target teaches your body something; a workout
> you crawl away from mostly teaches you to dread the erg. Save the 4s and
> 5s for days you arrive rested, and don't stack them back to back — the
> pyramid does more for you than heroics do.

`bodies/painScale.tsx` — `export function PainScaleBody()`:

> You don't need a heart rate strap to train well. Effort has been
> perceptible for as long as bodies have had legs, and the 1-to-5 pain
> scale is calibrated to sensation you already have. Here is what each
> level feels like from the seat.
>
> **1 — motion.** Warm, loose, unhurried. Conversation is easy; you could
> row like this while thinking about something else entirely. Warm-ups and
> recovery paddles live here.
>
> **2 — work you could keep doing.** Breathing is deeper and deliberate,
> sentences get shorter, and stopping early would feel unnecessary. Most
> steady O2 rowing sits here, and it should — this is the level you can
> visit almost every day.
>
> **3 — comfortably hard.** The contradiction is the definition: you're
> working, you'd rather not chat, your legs file regular reports, and yet
> the pace is sustainable. The threshold neighbourhood. Ending a piece at
> 3 feels like an accomplishment rather than an escape.
>
> **4 — hard intervals.** The burn arrives on schedule and builds. The rest
> intervals stop being pauses and become the thing you're rowing toward.
> You find yourself counting strokes. A 4 asks for a reason to be on the
> calendar — and a rested body to answer it.
>
> **5 — all out.** Nothing held back, no pacing games left, the last reps a
> negotiation between you and the piece. A genuine 5 costs days, which is
> why the library holds so few of them and the pyramid schedules them
> sparingly.
>
> Two rules make the scale useful. First: the number on a workout is a
> forecast; the number you log afterwards is a fact. Log what actually
> happened — an honest 4 that was planned as a 3 is information, not
> failure. Second: higher is not better. The scale exists so that most of
> your week sits at 2 and 3 on purpose, and so that when a 5 appears, both
> you and your training know exactly why it's there.

`releaseNotes.ts` (versions are real annotated tags; items name only
rower-visible change):

```ts
import type { ReleaseNote } from "./types";

// Newest first. Seeded retroactively at the News tab's launch (6H spec);
// from here on, a release gets a note when it changes something a rower
// would notice, and internal-only releases are skipped.
export const RELEASE_NOTES: ReleaseNote[] = [
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm test --project client -- src/news`. Expected: PASS. Also run
`pnpm lint && pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git rev-parse --show-toplevel
git add ../app/src/news/content
git commit -m "feat: the News shelf — four articles and the release notes, as data"
```

---

### Task 4: `useArticleReads` hook

**Files:**
- Create: `app/src/api/useArticleReads.ts`
- Create: `app/src/api/useArticleReads.test.ts`

**Interfaces:**
- Consumes: `api()` from `../api`; routes from Task 2
- Produces (Tasks 5/6 depend on this exact shape):

```ts
export type ArticleReadsState =
  | { state: "loading" }
  | { state: "error" }   // News/Reader render content normally, suppress unread claims
  | {
      state: "ready";
      readSlugs: ReadonlySet<string>;
      markRead: (slug: string) => void;  // optimistic; fires PUT, failure is silent
    };

export function useArticleReads(): ArticleReadsState;
```

- [ ] **Step 1: Write the failing tests.** Model the harness on
  `useBaselines`' neighbour tests (mock `../api`'s `api` with `vi.mock`,
  drive with `renderHook`/`waitFor` from Testing Library):

```ts
it("loads read slugs into a set", async () => {
  mockApi.mockResolvedValueOnce(jsonResponse({ slugs: ["baselines"] }));
  const { result } = renderHook(() => useArticleReads());
  await waitFor(() => expect(result.current.state).toBe("ready"));
  const ready = result.current as Extract<ArticleReadsState, { state: "ready" }>;
  expect(ready.readSlugs.has("baselines")).toBe(true);
});

it("markRead is optimistic and fires the PUT", async () => {
  mockApi.mockResolvedValueOnce(jsonResponse({ slugs: [] }));
  const { result } = renderHook(() => useArticleReads());
  await waitFor(() => expect(result.current.state).toBe("ready"));
  mockApi.mockResolvedValueOnce(new Response(null, { status: 204 }));
  act(() => (result.current as any).markRead("pain-scale"));
  expect((result.current as any).readSlugs.has("pain-scale")).toBe(true); // before PUT resolves
  await waitFor(() =>
    expect(mockApi).toHaveBeenCalledWith("/api/article-reads/pain-scale", {
      method: "PUT",
    }),
  );
});

it("a failed PUT stays silent and keeps the optimistic state for this visit", async () => {
  mockApi.mockResolvedValueOnce(jsonResponse({ slugs: [] }));
  const { result } = renderHook(() => useArticleReads());
  await waitFor(() => expect(result.current.state).toBe("ready"));
  mockApi.mockRejectedValueOnce(new Error("offline"));
  act(() => (result.current as any).markRead("baselines"));
  await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2));
  expect((result.current as any).readSlugs.has("baselines")).toBe(true);
});

it("a failed fetch reports error, not a wrong empty set", async () => {
  mockApi.mockRejectedValueOnce(new Error("offline"));
  const { result } = renderHook(() => useArticleReads());
  await waitFor(() => expect(result.current.state).toBe("error"));
});

it("marking an already-read slug fires no duplicate PUT", async () => {
  mockApi.mockResolvedValueOnce(jsonResponse({ slugs: ["baselines"] }));
  const { result } = renderHook(() => useArticleReads());
  await waitFor(() => expect(result.current.state).toBe("ready"));
  act(() => (result.current as any).markRead("baselines"));
  expect(mockApi).toHaveBeenCalledTimes(1); // just the initial GET
});
```

- [ ] **Step 2: Run to verify failure**: `pnpm test --project client -- useArticleReads`. Expected: FAIL.

- [ ] **Step 3: Implement** (`useBaselines`' cancelled-effect idiom; state
  in a `Set` copied on write):

```ts
import { useEffect, useState } from "react";
import { api } from "../api";

export type ArticleReadsState = /* as in Interfaces above */;

export function useArticleReads(): ArticleReadsState {
  const [state, setState] = useState<ArticleReadsState>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;

    const markRead = (slug: string) => {
      setState((prev) => {
        if (prev.state !== "ready" || prev.readSlugs.has(slug)) return prev;
        const next = new Set(prev.readSlugs);
        next.add(slug);
        // Fire-and-forget: read state is a nicety. A failed PUT simply
        // leaves the article unread on the next fetch (6H spec).
        void api(`/api/article-reads/${slug}`, { method: "PUT" }).catch(
          () => {},
        );
        return { ...prev, readSlugs: next };
      });
    };

    api("/api/article-reads")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const { slugs } = (await res.json()) as { slugs: string[] };
          setState({ state: "ready", readSlugs: new Set(slugs), markRead });
        } else {
          setState({ state: "error" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
```

- [ ] **Step 4: Run tests to verify pass**: same command, PASS. Check the
  per-file coverage for `useArticleReads.ts` (every branch above has a test).

- [ ] **Step 5: Commit**

```bash
git rev-parse --show-toplevel
git add ../app/src/api/useArticleReads.ts ../app/src/api/useArticleReads.test.ts
git commit -m "feat: useArticleReads — optimistic reads, honest failure"
```

---

### Task 5: the News screen, the tab swap, the routes

**Files:**
- Create: `app/src/news/News.tsx`, `app/src/news/News.test.tsx`
- Create: `app/src/news/newsDates.ts`, `app/src/news/newsDates.test.ts`
- Modify: `app/src/shell/TabBar.tsx` (TABS), `app/src/shell/TabBar.test.tsx`
- Modify: `app/src/shell/AppRoutes.tsx` (+ `AppRoutes.test.tsx`)
- Modify: `app/src/index.css` (`.news-*` rules)

**Interfaces:**
- Consumes: Task 3's registry/selectors, Task 4's hook, `TypeBadge`
  (`components/TypeBadge.tsx`), design tokens.
- Produces: routes `/news` (News), plus placeholder-free tab order
  `TODAY · NEWS · LIBRARY · PLAN · YOU`. Task 6 adds `/news/:slug` and
  `/news/releases`; register all three in THIS task with Task 6's screens
  stubbed as the components Task 6 will fill in? **No — YAGNI: this task
  registers only `/news`.** Task 6 registers its own two routes.

Screen structure (classes are the contract for CSS and tests):

```tsx
<main className="screen news-screen">
  <p className="news-masthead">ERGOMATIC · {mastheadDate(new Date())}</p>
  <div className="news-title-row">
    <h1 className="screen-title">News</h1>
    {reads.state === "ready" && unreadCount(reads.readSlugs) > 0 && (
      <span className="news-unread-count">
        {unreadCount(reads.readSlugs)} UNREAD
      </span>
    )}
  </div>

  <section className="news-pinned" aria-labelledby="news-pinned-h">
    <h2 id="news-pinned-h" className="news-section-label">PINNED</h2>
    {pinnedArticles().map((a) => (
      <ArticleRow key={a.slug} article={a} reads={reads} />
    ))}
  </section>

  <section aria-labelledby="news-latest-h">
    <h2 id="news-latest-h" className="news-section-label">LATEST</h2>
    {latestArticles().map((a) => (
      <ArticleRow key={a.slug} article={a} reads={reads} />
    ))}
  </section>

  <section className="news-whatsnew" aria-labelledby="news-whatsnew-h">
    <h2 id="news-whatsnew-h" className="news-section-label">WHAT'S NEW</h2>
    <p className="news-release-version">
      {latest.version} · {releaseDate(latest.date)}
    </p>
    <ul className="news-release-items">
      {latest.items.map((item) => <li key={item}>{item}</li>)}
    </ul>
    <Link className="news-text-link" to="/news/releases"
          state={{ from: "/news" }}>
      ALL RELEASE NOTES
    </Link>
  </section>
</main>
```

`ArticleRow` (local component in News.tsx): the whole row is the hit target
(≥44px). First-party →
`<Link to={`/news/${a.slug}`} state={{ from: "/news" }}>`; linked →
`<a href={a.linked.url} target="_blank" rel="noopener"` with an `↗` on the
headline, the italic commentary line, a source line ending
`OPENS YOUR BROWSER`, and `onClick={() => reads.markRead(a.slug)}`. Every
row: `<span className="news-square" data-read={isRead} aria-hidden="true"/>`
plus a visually-hidden `Unread`/`Read` word inside the link text (the app
has no `.sr-only` utility yet — add one in index.css this task, standard
clip-rect recipe). Read rows: title `font-weight: 400`, `color: var(--ink-3)`
via `.news-row[data-read="true"] .news-row-title`. Meta line:
`ERGOMATIC · {minutes} MIN` (+ ` · READ` suffix once read). The
`workout-types` row (`typeChips`) renders the four `<TypeBadge/>`s after the
meta line — the ONLY place teal/ochre appear on News. When
`reads.state !== "ready"`, render every row without squares, count, or READ
suffixes (spec: never claim a wrong number).

`newsDates.ts`:

```ts
// "WED 5 AUG" — the masthead's own format (design 2a).
export function mastheadDate(d: Date): string {
  return d
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .replaceAll(",", "")
    .toUpperCase();
}

// "4 AUG" from ISO "2026-08-04" (WHAT'S NEW's version line).
export function releaseDate(iso: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!))
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .toUpperCase();
}
```

- [ ] **Step 1: Write the failing tests.**
  - `newsDates.test.ts`: `mastheadDate(new Date(2026, 7, 5))` →
    `"WED 5 AUG"`; `releaseDate("2026-08-04")` → `"4 AUG"`.
  - `TabBar.test.tsx`: update the existing tab-list assertion to
    `["TODAY", "NEWS", "LIBRARY", "PLAN", "YOU"]` and add: no tab labelled
    TREND renders.
  - `AppRoutes.test.tsx`: `/news` renders the News screen; `/trend` now
    falls through to the catch-all (lands on Today).
  - `News.test.tsx` (mock `../api/useArticleReads` per scenario; the
    registry is real — realistic fixture, recurring-failure #3):
    - ready+empty reads: both pins and both latest stories render, count
      reads `4 UNREAD`, every square `data-read="false"`.
    - ready+`baselines` read: count reads `3 UNREAD`; the baselines row's
      square flips `data-read="true"`, its meta gains `· READ`.
    - all read: no `UNREAD` count renders at all.
    - error state: rows render, NO `.news-square`, NO count (suppression
      pin).
    - the workout-types row shows the four type chips (`O2`,`AT`,`TR`,`AN`).
    - WHAT'S NEW shows `RELEASE_NOTES[0]`'s version+items and the
      ALL RELEASE NOTES link.
    - no element under the screen carries `button-l1` (the no-START rule as
      a unit-level pin; the e2e sweep re-proves it computed).

- [ ] **Step 2: Run to verify failure**: `pnpm test --project client -- src/news src/shell`. Expected: FAIL.

- [ ] **Step 3: Implement.** TabBar TABS becomes (design §8 order — NEWS
  second):

```ts
export const TABS = [
  { path: "/today", label: "TODAY" },
  { path: "/news", label: "NEWS" },
  { path: "/library", label: "LIBRARY" },
  { path: "/plan", label: "PLAN" },
  { path: "/you", label: "YOU" },
];
```

(keep the `/library` onClick wiring untouched). AppRoutes: delete the
`/trend` route AND the now-unused `Placeholder` component if nothing else
uses it (grep first — recurring-failure #5 applies to components too); add
`<Route path="/news" element={<News />} />`. CSS in index.css: `.news-*`
block using tokens — masthead/section labels in the mono 10–11px
letter-spaced idiom already used app-wide (copy an existing label rule's
values), `.news-square` a 10px square `background: var(--accent)` when
unread / `background: var(--page); border: 1px solid transparent` when read
(holds the indent), `.news-pinned` bordered `var(--surface)` card,
`.news-whatsnew` `var(--surface-sunken)` inset, `.news-unread-count` and
durations in accent mono, rows ≥44px with `border-bottom: 1px solid
var(--rule)`. Plus the `.sr-only` utility.

- [ ] **Step 4: Run tests to verify pass**: same command, PASS. Then
  `pnpm lint && pnpm typecheck && pnpm test`.

- [ ] **Step 5: Commit**

```bash
git rev-parse --show-toplevel
git add -A ../app/src
git commit -m "feat: the News tab — Trend's placeholder yields the second slot"
```

---

### Task 6: the reader and the release-notes list

**Files:**
- Create: `app/src/news/Reader.tsx`, `app/src/news/Reader.test.tsx`
- Create: `app/src/news/Releases.tsx`, `app/src/news/Releases.test.tsx`
- Modify: `app/src/shell/AppRoutes.tsx` (+ test): `/news/:slug`,
  `/news/releases` — register `/news/releases` BEFORE `/news/:slug` is not
  required (React Router ranks static over dynamic; see the comment already
  in AppRoutes.tsx at the `/library/new` route) but declare it first anyway,
  matching that file's own convention
- Modify: `app/src/index.css` (`.reader-*` rules)

**Interfaces:**
- Consumes: `articleBySlug`, `nextUnreadSlug`, Task 4's hook, `BackLink`
  (`shell/BackLink.tsx`, `fallback="/news"`), `useParams`/`Navigate`.
- Produces: the reader marks articles read (the behavior Task 7's e2e
  proves end-to-end).

Reader structure:

```tsx
const { slug } = useParams();
const article = slug ? articleBySlug(slug) : undefined;
if (!article || article.kind !== "first-party") {
  return <Navigate to="/news" replace />;
}
// mark read once ready — in an effect keyed on (reads.state, article.slug)
<main className="screen reader-screen">
  <BackLink fallback="/news" />
  <p className="reader-meta">
    ERGOMATIC · {article.minutes} MIN
    {article.updatedAt && ` · UPDATED ${updatedLabel(article.updatedAt)}`}
  </p>
  <h1 className="reader-title">{article.title}</h1>
  <article className="reader-body">{article.body}</article>
  {next && (
    <Link className="reader-next" to={`/news/${next.slug}`}
          state={{ from: location.pathname }}>
      NEXT · {next.minutes} MIN — {next.title}
    </Link>
  )}
</main>
```

`updatedLabel("2026-07-01")` → `"JUL 2026"` — add to `newsDates.ts` with a
test (month short + year, uppercase). `next` comes from
`reads.state === "ready" ? nextUnreadSlug(article.slug, reads.readSlugs) : null`
resolved through `articleBySlug` — on a reads error the footer simply
doesn't render (suppression rule again). The mark-read effect:

```tsx
useEffect(() => {
  if (reads.state === "ready") reads.markRead(article.slug);
  // markRead is stable per ready-state; keying on state+slug is enough
}, [reads.state, article.slug]);
```

Releases screen: `BackLink fallback="/news"`, `screen-title` "Release
notes", one block per `RELEASE_NOTES` entry (version · date line + items
list. No read state anywhere on it).

CSS: `.reader-title` Newsreader ~31px (match the mock's serif title);
`.reader-body p` Newsreader at a reading size (~17px/1.55 — nothing else in
the app reads long-form, so these are new rules, kept minimal);
`.reader-body h2` Newsreader ~22px; `.reader-inset`
`var(--surface-sunken)` block in the mono label idiom; `.reader-meta` the
existing mono-label idiom; `.reader-next` a text link (accent, mono) with
≥44px target height.

- [ ] **Step 1: Write the failing tests.**
  - `Reader.test.tsx` (render at `/news/baselines` via `MemoryRouter
    initialEntries`; mock the hook):
    - renders title, meta (`ERGOMATIC · 3 MIN`), and body prose (assert a
      distinctive sentence from the baselines body renders).
    - calls `markRead("baselines")` once ready (spy on the mocked hook) —
      and does NOT call it while loading.
    - unknown slug redirects to `/news` (assert News content renders).
    - NEXT footer names the next unread article; with every other article
      read, no NEXT renders.
    - reads error: article still renders fully; no NEXT.
  - `Releases.test.tsx`: all three seeded versions render, newest first;
    a BACK link renders.
  - `AppRoutes.test.tsx`: `/news/baselines` renders reader; `/news/releases`
    renders the list (registered before `:slug`, so it must NOT be captured
    as a slug).

- [ ] **Step 2: Run to verify failure**: `pnpm test --project client -- src/news`. FAIL.

- [ ] **Step 3: Implement** per the structures above.

- [ ] **Step 4: Run tests to verify pass**, then the full local gate:
  `pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage` — check
  per-file numbers for every file this phase created.

- [ ] **Step 5: Commit**

```bash
git rev-parse --show-toplevel
git add -A ../app/src
git commit -m "feat: the reader — where an unread square goes to die"
```

---

### Task 7: e2e, screenshots, docs, and the record

**Files:**
- Create: `app/e2e/news.spec.ts`
- Modify: `app/e2e/design.spec.ts`, `app/e2e/screenshots.spec.ts`
- Modify: `docs/design/DEVIATIONS.md`, `docs/design/README.md`, `ROADMAP.md`

**Interfaces:**
- Consumes: everything above, `app/e2e/helpers.ts`' sign-in/seed idiom
  (read it and an existing spec before writing anything).

- [ ] **Step 1: Write the flow spec** (`news.spec.ts`), expected red only
  where it pins NEW behavior (the screens exist by now, so these should
  mostly pass — the point is the cross-reload proof no client test can
  give):
  - Tab order: the tab bar lists exactly
    TODAY · NEWS · LIBRARY · PLAN · YOU.
  - `/news` shows `4 UNREAD`, two pinned rows, two latest rows, WHAT'S NEW
    with `v0.5.1`.
  - Open the baselines article → reader shows the prose → BACK returns to
    News → the baselines row now reads `· READ`, count shows `3 UNREAD`.
  - **Reload the page** → still `3 UNREAD` (the server round-trip, the
    thing the whole phase exists to persist).
  - Reader NEXT footer: from `/news/workout-types`, NEXT names the
    baselines article… unless already read in this test's flow — order the
    steps so the assertion is deterministic.
  - `/news/releases` lists all three versions.

- [ ] **Step 2: Design sweeps** (append to `design.spec.ts`, following its
  existing per-screen sweep structure):
  - axe pass on `/news`, `/news/baselines`, `/news/releases` — with a
    MIXED read state seeded first (one article read), not the virgin state.
  - every interactive target on all three screens ≥44×44 computed.
  - the read-row title computes `color: rgb(87, 84, 76)` (`--ink-3`) and
    `font-weight: 400`; the contrast ratio against both `--page` (#f4f1e8)
    and `--surface` (#fffdf7) computed in-test ≥4.5 (expected ≈6.8:1 and
    ≈7.0:1 — put the measured numbers in the task report).
  - NO element under `/news` (any of the three screens) matches
    `[class*="button-l1"]` — the no-START rule, computed.
  - the unread square computes `background-color: rgb(181, 52, 31)`
    (`--accent`) when unread and `rgb(244, 241, 232)` (`--page`) when read.

- [ ] **Step 3: Screenshots** (append `news` and `news-reader` tests to
  `screenshots.spec.ts`, copying its seed-then-capture idiom): seed a
  mixed read state first (mark one article read through the UI, not the
  API, so the capture is honest), then capture `/news` and
  `/news/baselines`. **Open both PNGs and look at them** — squares, count,
  READ suffix, serif body all visible (recurring-failure #7).

- [ ] **Step 4: Run everything**

```
pnpm e2e          # full suite — twice, back to back, both green
pnpm screenshots
pnpm lint && pnpm typecheck && pnpm test:coverage
```

- [ ] **Step 5: Docs.**
  - `docs/design/DEVIATIONS.md` rows (current-state voice, per its own
    conventions): 6H ships News without the Start-here pin (6I's), without
    collections (not built, per the handoff itself), with zero linked
    stories published (the kind renders, none exist), and without You/Trend
    changes (6I/6J).
  - `docs/design/README.md`: one-line pointer —
    `docs/design/handoffs/2026-08-07-news-tab/` is the News tab's design
    authority.
  - `ROADMAP.md`: add the Phase 6H section (status, goal, bullets checked,
    exit criterion: "a fresh account sees four articles and 4 UNREAD;
    reading one survives a reload and a second device; TREND is gone"),
    plus not-started stubs for 6I (Today onboarding — naming the
    Today.tsx/7B sequencing constraint) and 6J (Trend charts on You —
    naming the chart-spec design pass and the Phase 8 amendment).

- [ ] **Step 6: Commit, push, PR**

```bash
git rev-parse --show-toplevel
git add -A
git commit -m "test+docs: News proven against the real stack; the record updated"
git push -u origin phase-6h-news-tab
```

Open the PR with `gh pr create`: rich body per repo standards — feature
table, BOTH screenshots inline, the computed contrast numbers, and the
review-risk paragraph. **Do not merge — present the PR and stop; the merge
decision is James's.**

---

## Self-review record

- **Spec coverage:** tab swap+order (T5), no-l1 rule (T5 unit + T7
  computed), pinned/latest/read-styling/unread-count+suppression (T5),
  type-chips row (T3/T5), WHAT'S NEW + `/news/releases` (T3/T5/T6), reader
  typography/NEXT/BackLink/unknown-slug (T6), linked-kind rendering with
  zero published (T3 model + T5 row), read-state table/API/idempotency/
  isolation/slug-shape (T1/T2), optimistic mark + silent failure (T4),
  four articles with 1–5 pain vocabulary (T3), e2e/screenshots/per-file
  coverage (T7), DEVIATIONS/README/ROADMAP (T7). Deliberately absent, per
  spec: Start-here pin, collections, Today/You changes, `/trend` redirect.
- **Placeholders:** none — article prose, route code, hook code, and test
  bodies are all present in full. Harness *setup* lines defer to named
  neighbour files by design (the repo treats those as the living idiom).
- **Type consistency:** `ArticleReadsStore.{list,markRead}` (T1) = what T2
  wires; `{slugs: string[]}` (T2) = what T4 parses; `ArticleReadsState`
  (T4) = what T5/T6 consume; selector names (T3) = what T5/T6 import;
  `data-read`/`.news-square`/`.reader-*` class contract (T5/T6) = what T7
  computes against.
