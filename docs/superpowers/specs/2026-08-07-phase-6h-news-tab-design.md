# Phase 6H — News tab core

**Date:** 2026-08-07
**Design authority:** `docs/design/handoffs/2026-08-07-news-tab/` (turn 2 of
`News tab.dc.html`; turn 1's `1c` reader typography still governs the reader).
**Decided with James (2026-08-07):** bundled content, News-first sequencing,
four articles at launch, WHAT'S NEW seeded retroactively.

## What this phase is

The TREND tab becomes NEWS: a reading and orientation surface holding
first-party explainer articles, an in-app reader, and release notes. It ships
the app's teaching content (the workout types, baselines, picking a workout,
the pain scale) as pinned/latest stories with per-user read state.

This is the first of three phases delivering the 2026-08-07 handoff:

- **6H (this phase):** the News tab, reader, read state, four articles,
  WHAT'S NEW.
- **6I (next):** Today onboarding — the START HERE four-step block, the
  no-baseline `SETS YOUR BASELINE` suggestion card, the "Learning the app"
  row + detail on You, and the *Start here* pinned row in News (it appears
  only once dismissal exists, so it belongs to 6I, not 6H).
- **6J (later):** Trend charts on You — needs its own chart-spec design pass
  (handoff open question #1); amends Phase 8, whose Progress charts relocate
  to You.

**Sequencing rationale:** Phase 7A-fix-3 (domain/driver) and 7B (Confirm,
Timer, Today guards — still in design) run concurrently. 6H touches none of
their surfaces: all-new `src/news/`, small `TabBar.tsx`/`AppRoutes.tsx`
edits, one additive table. Today onboarding (6I) is deliberately held until
7B's Today touch is sequenced.

## Out of scope, explicitly

- Everything listed under 6I and 6J above.
- **Collections** — the handoff says the collection card "should not block
  the News build"; not built, no placeholder.
- **Linked/external stories at launch** — the rendering kind ships (see
  content model) but zero linked stories are published; adding one later is
  a content-only change.
- Any monitor/PM5 surface, including the mock's "Monitors and heart rate"
  settings row (7B's territory; the handoff flags You's settings rows as
  filler anyway).
- The "Reading the tinted numbers while you row" article — describes
  connected mode; waits for 7B to ship.

## Tab bar and routes

- `TabBar.tsx` `TABS`: `TODAY · NEWS · LIBRARY · PLAN · YOU` (design §8
  order — NEWS second). `/trend` entry removed.
- `AppRoutes.tsx`: `/trend` placeholder route deleted; `/news` (News screen)
  and `/news/:slug` (reader) added. No redirect from `/trend` — it was a
  placeholder only; a stale deep link falls through to the existing
  catch-all behaviour.
- Design §2: **no level-1 button anywhere on News.** Accent appears only as
  unread squares, durations, and text links. Today keeps the only START in
  the app.

## Content model (bundled, no CMS)

Articles are typed TSX modules under `app/src/news/content/`, exported
through one registry (`articles.ts`). No markdown dependency, no server
storage; prose is versioned and PR-reviewed like code.

```ts
type ArticleKind = "first-party" | "linked";

interface NewsArticle {
  slug: string;              // stable identity; read state keys on it
  title: string;
  minutes: number;           // reading time, shown as `3 MIN`
  kind: ArticleKind;
  pinned: boolean;           // editorial, per design §3
  publishedAt: string;       // ISO date; LATEST sorts newest first
  updatedAt?: string;        // reader shows `UPDATED JUL 2026` when present
  body: ReactNode;           // first-party only
  linked?: {                 // linked only
    url: string;
    sourceName: string;      // e.g. `ROWING NEWS`
    commentary: string;      // our italic Newsreader note
  };
}
```

Registry invariants, unit-tested: slugs unique; pinned count ≤ 3 (handoff
open question #2 — three is comfortable, five pushes LATEST below the fold);
exactly one of `body`/`linked` present per kind; `minutes ≥ 1`.

Release notes are a second bundled list (`releaseNotes.ts`):
`{ version, date, items: string[] }`, newest first. Versions name real
annotated tags (the repo's only version authority). Seeded retroactively
with hand-written notes for shipped, rower-visible work (at minimum: the
300-workout library, Today's visible filters/type-swap, the button/target
UI round). Cadence going forward: write one when a release changes something
a rower would notice; skip internal-only releases.

### The four launch articles

All four are pinned=false LATEST stories except the first two, which are the
permanent pins (design §3, with O2/AT/TR/AN chips on the types row):

1. **The four workout types, and how hard each should feel** (pinned) —
   O2/AT/TR/AN translated, work:rest character of each, and the training
   pyramid: O2 base → AT → TR → AN tip; most of your metres are slow.
2. **What a baseline is, and why every pace comes from one** (pinned) — the
   offset model, `6k −2` literacy, first 6k as a baseline, why 2k and 6k
   are separate baselines.
3. **Picking a workout by how much it should hurt** — pain 1–5, time
   available, type; how the suggestion thinks.
4. **The pain scale, without a heart rate strap** — the 1–5 levels on the
   erg, longer ≠ higher pain.

**Content discipline (binding, same as Phase 6E's):** prose is original,
structurally informed by James's book photos, never verbatim; no book
title/author reproduction inside article bodies. Every article uses
Ergomatic's own vocabulary — pain is **1–5** (the book's 1–10 never
appears), difficulty is easy/medium/hard, paces are house `m:ss.d` format.
James reviews the prose in the PR diff.

## The News screen

Top to bottom, per screen 2a:

- Masthead: `ERGOMATIC · <date>` mono line, `News` serif title, unread
  count (`6 UNREAD`) — count is pinned+latest articles the user hasn't
  read; suppressed entirely (not shown as 0) if read state failed to load.
- **PINNED** — bordered card block rendered above LATEST. "Does not scroll
  away with the feed" (design §3) means ordering semantics — pinned stories
  hold the top of the page regardless of publication date — NOT
  `position: sticky`; the block scrolls with the page like everything else
  in this app. Each row: unread square, title, meta line. The types
  explainer row carries the four type chips in their real type colours.
  (The *Start here* pinned row is 6I's.)
- **LATEST** — flat rows, newest first: unread square, serif title, meta
  (`ERGOMATIC · 3 MIN`, `· READ` suffix once read). A pinned article
  appears only in PINNED, never repeated in LATEST (the mock's LATEST
  holds different stories from its pins).
- **WHAT'S NEW** — inset block showing the latest release (`2.4 · 2 AUG`
  format becomes `<version> · <date>`), its items, and an `ALL RELEASE
  NOTES` text link to a plain full list (`/news/releases`, same screen
  chrome, no read state).
- Read styling (design §5): unread = filled accent square; read = a
  page-coloured square holding the indent, title drops to weight 400 and
  secondary ink. No resume position, no progress percentages.
- Teal and ochre never appear on News except as the type chips on the
  pinned types row — they keep meaning O2 and AT.

## The reader (`/news/:slug`)

Turn 1 `1c` typography: Newsreader serif body at reading size, mono meta
line (`ERGOMATIC · 3 MIN · UPDATED JUL 2026`), Archivo for any UI. In-app
examples may use the inset block style (`IN THE APP` panel). Footer: `NEXT ·
<minutes>` link to the next unread article (publication order, wrapping),
absent when everything is read. `← BACK` via the existing shared `BackLink`
(history-aware). Unknown slug → the app's existing not-found idiom.

A linked story never opens the reader: its row is an external anchor
(`↗` on the headline, source line ending `OPENS YOUR BROWSER`,
`target="_blank" rel="noopener"` → system browser in the native shell).

## Read state (the one server touch)

- Schema, additive: `article_reads (user_id fk → users, slug text, read_at
  timestamptz default now(), primary key (user_id, slug))`. No FK to
  content — content is bundled; slugs unknown to the current bundle are
  ignored at display time and left in place (a rollback keeps its reads).
- API, additive, session-guarded like every data route:
  - `GET /api/article-reads` → `{ slugs: string[] }`
  - `PUT /api/article-reads/:slug` → 204, idempotent upsert. Slug validated
    against a conservative shape (`^[a-z0-9-]{1,64}$`), not against the
    bundle (client and server versions may skew mid-deploy).
- Client: reader marks read on mount — optimistic local update + fire the
  PUT; a failed PUT leaves the article unread on next fetch (acceptable —
  read state is a nicety, never data a rower loses sleep over). News screen
  fetches reads once per visit; fetch failure renders all content normally
  with unread markers and the count suppressed (never claim a wrong
  number).

## Error handling summary

- Reads fetch fails → full content renders, no unread claims.
- Read PUT fails → silent; state self-corrects on next successful mark.
- Unknown reader slug → existing not-found idiom.
- Release notes and articles are bundled — no loading or empty states
  needed anywhere except read-state suppression above.

## Testing

Per docs/TESTING.md; the specific obligations:

- **Unit:** registry invariants (unique slugs, pin cap, kind/body
  exclusivity); release-notes ordering; next-unread selection incl. wrap
  and all-read.
- **Client:** News screen renders pinned/latest/what's-new from a realistic
  fixture registry (NOT an empty one — recurring-failure #3); read greying
  + square swap driven by read state; unread count math; suppressed count
  on fetch failure; reader mark-read fires on mount; linked-story row is an
  external anchor, not a router link.
- **Integration:** `article_reads` round-trip, idempotent PUT, per-user
  isolation, slug-shape rejection.
- **e2e (`pnpm e2e` mandatory — this diff touches `app/src/`):** tab order
  swap (TREND gone, NEWS second); News → reader → BACK returns to News;
  read state visibly persists across reload; structural design sweeps —
  44px targets on every row/link, axe pass, computed-contrast on the read
  (secondary-ink) title against page AND card backgrounds with the ratio
  recorded in the report (recurring-failure #6), the no-level-1-button
  rule asserted (no `.button-l1` under `/news`).
- **Screenshots:** `news.png` and `news-reader.png` with real seeded read
  state (some read, some unread — not an empty state; recurring-failure
  #7), opened and looked at.
- **Per-file coverage** checked for every new file, not the aggregate gate
  (recurring-failure #2).

## Docs obligations at close

- `docs/design/DEVIATIONS.md`: rows for what 6H deliberately does not ship
  from the mock (Start-here pin, collections, linked stories, You/Trend
  content) and any type-token divergence found while building.
- `docs/design/README.md`: one-line pointer to the News handoff as the
  tab's design authority.
- `ROADMAP.md`: 6H section checked off; 6I/6J sections added as
  not-started with this spec named.
- TestFlight recommendation posted after merge (standing rule).
