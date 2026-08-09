import { useEffect, useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { WorkoutType } from "../../domain/types.js";
import TypeBadge from "../components/TypeBadge";
import { useArticleReads } from "../api/useArticleReads";
import type { ArticleReadsState } from "../api/useArticleReads";
import { usePreferences } from "../api/usePreferences";
import { startHereReadCount } from "../today/startHereSteps";
import {
  latestArticles,
  pinnedArticles,
  unreadCount,
} from "./content/articles";
import { loadNewsScroll, saveNewsScroll } from "./newsScroll";
import { RELEASE_NOTES } from "./content/releaseNotes";
import type { NewsArticle } from "./content/types";
import { mastheadDate, releaseDate } from "./newsDates";

// Trailing-edge throttle, copied from `library/Library.tsx`'s own idiom
// (same value, same reasoning — a save fires immediately if 100ms have
// passed since the last one, otherwise it's rescheduled for whatever's
// left of that window, so the FINAL scroll position before the rower
// stops always gets written). Kept as a local constant rather than a
// shared import — this repo's established per-file duplication
// convention (see `Library.tsx`'s own `TYPE_COLOR_VAR` comment for the
// precedent this follows).
const SCROLL_SAVE_THROTTLE_MS = 100;

// Design 2a's own row order for the workout-types pinned row — the ONLY
// place teal/ochre appear on News (articles.tsx's own `typeChips` flag).
const TYPE_CHIP_ORDER: WorkoutType[] = ["O2", "AT", "TR", "AN"];

// `undefined`, never `false`, whenever `reads.state !== "ready"` — the
// screen has no honest opinion about read/unread while the fetch is loading
// or has failed, so neither the square, the accessible Read/Unread word, nor
// the " · READ" suffix ever renders a value this screen can't back up (6H
// spec: never claim a wrong number).
function readStateFor(
  slug: string,
  reads: ArticleReadsState,
): boolean | undefined {
  return reads.state === "ready" ? reads.readSlugs.has(slug) : undefined;
}

export function ArticleRow({
  article,
  reads,
}: {
  article: NewsArticle;
  reads: ArticleReadsState;
}) {
  const isRead = readStateFor(article.slug, reads);
  const metaSuffix = isRead ? " · READ" : "";

  const title = (
    <span className="news-row-title">
      {article.title}
      {article.kind === "linked" && <span aria-hidden="true"> ↗</span>}
      {isRead !== undefined && (
        <span className="visually-hidden">{isRead ? " Read" : " Unread"}</span>
      )}
    </span>
  );

  // Suppressed (not rendered) rather than shown as a "read" square whenever
  // the read state itself is unknown — the same suppression pin as the
  // count above, at row granularity.
  const square = isRead !== undefined && (
    <span className="news-square" data-read={isRead} aria-hidden="true" />
  );

  if (article.kind === "linked") {
    const linked = article.linked!;
    return (
      <a
        href={linked.url}
        target="_blank"
        rel="noopener"
        className="news-row"
        data-read={isRead}
        onClick={() => {
          if (reads.state === "ready") reads.markRead(article.slug);
        }}
      >
        {square}
        <span className="news-row-body">
          {title}
          <span className="news-row-commentary">{linked.commentary}</span>
          <span className="news-row-meta">
            {linked.sourceName} · {article.minutes} MIN{metaSuffix} · OPENS YOUR
            BROWSER
          </span>
        </span>
      </a>
    );
  }

  return (
    <Link
      to={`/news/${article.slug}`}
      state={{ from: "/news" }}
      className="news-row"
      data-read={isRead}
    >
      {square}
      <span className="news-row-body">
        {title}
        <span className="news-row-meta">
          ERGOMATIC · {article.minutes} MIN{metaSuffix}
        </span>
        {article.typeChips && (
          <span className="news-row-chips">
            {TYPE_CHIP_ORDER.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </span>
        )}
      </span>
    </Link>
  );
}

/** The Start-here pinned row (design spec §"Learning the app on You" /
 *  News's own §3, screen 2a): a special pinned row, not a registry article
 *  — it has no body of its own (opens `/you/learning`, not a Reader page),
 *  and its "read state" is the aggregate of the four step slugs
 *  (`startHereReadCount`, the same helper StartHere.tsx/You.tsx/
 *  LearningTheApp.tsx all share) rather than a single slug's own read flag.
 *  Renders only while `preferences.startHereDismissed` is POSITIVELY known
 *  to be true — not merely "not false" — so a still-loading/errored
 *  preferences fetch never risks showing a pin for a rower who never
 *  dismissed anything. The count portion of its own meta line follows the
 *  same suppression rule the count itself already uses elsewhere
 *  (`startHereReadCount` returns `null` while reads aren't ready). */
function StartHerePin({ reads }: { reads: ArticleReadsState }) {
  const readCount = startHereReadCount(reads);
  return (
    <Link
      to="/you/learning"
      state={{ from: "/news" }}
      className="news-row news-pin-starthere"
    >
      <span className="news-row-body">
        <span className="news-row-title">Start here, in four steps</span>
        <span className="news-row-meta">
          {readCount !== null ? `${readCount} OF 4 READ · ` : ""}DISMISSED ON
          TODAY
        </span>
      </span>
    </Link>
  );
}

export default function News() {
  const reads = useArticleReads();
  const preferences = usePreferences();
  const latest = RELEASE_NOTES[0]!;
  const unread = reads.state === "ready" ? unreadCount(reads.readSlugs) : 0;
  const startHereDismissed =
    preferences.state === "ready" && preferences.preferences.startHereDismissed;
  const restoredScrollRef = useRef(false);
  // The save effect below needs to tell "a real scroll of THIS screen"
  // apart from a scroll event that fires AFTER this screen's own DOM has
  // already been replaced — see that effect's own comment for the actual
  // bug this guards.
  const rootRef = useRef<HTMLElement>(null);
  // Every ROW on this screen carries read-state-dependent markup (the
  // unread square, the accessible Read/Unread word, the " · READ" meta
  // suffix — all suppressed, not just blank, while `reads.state ===
  // "loading"`, per `readStateFor`'s own suppression rule above), and the
  // Start-here pin's very PRESENCE depends on `preferences` settling too —
  // so BOTH fetches settling is what "this screen's real final height is
  // now known" actually means, not just one. "Settled" means ready OR
  // error for each, not `rowsReady`-style "ready only" the way
  // `Library.tsx` gates its own restore (Library shows a LOADING
  // placeholder with no list at all while loading; News never does — every
  // row renders immediately, just with its read-state markup missing until
  // this settles).
  const contentSettled =
    reads.state !== "loading" && preferences.state !== "loading";

  // Save scroll position for the lifetime of this screen, throttled to
  // ~100ms — copies `Library.tsx`'s own save effect idiom, with one
  // defensive addition Library's own shorter-lived screen never needed:
  // `onScroll` bails out once `rootRef.current` is no longer connected to
  // the document. `.overlay-screen`'s own comment (index.css) documents
  // that navigating to the reader collapses `.app-shell`'s document flow
  // the instant its `position: fixed` root mounts, and that the browser
  // clamps `window.scrollY` to the new, much shorter height as an
  // automatic consequence — a real "scroll" event on `window`. Nothing
  // guarantees that clamp fires strictly AFTER this effect's own cleanup
  // has run (a passive effect's cleanup is scheduled after paint, not
  // synchronously with the route change), so a still-attached listener
  // could catch it and silently overwrite a correct save with a
  // near-zero clamp artifact. Checking `isConnected` on the ROOT element
  // News itself renders — true for exactly as long as this screen is
  // genuinely the one on screen — is what tells a real rower-driven
  // scroll apart from that kind of echo, regardless of which route React
  // is currently transitioning to.
  useEffect(() => {
    let lastKnownY = window.scrollY;
    let lastSavedAt = 0;
    let trailing: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      lastSavedAt = Date.now();
      saveNewsScroll(lastKnownY);
    };
    const onScroll = () => {
      if (!rootRef.current?.isConnected) return;
      lastKnownY = window.scrollY;
      const elapsed = Date.now() - lastSavedAt;
      if (elapsed >= SCROLL_SAVE_THROTTLE_MS) {
        flush();
      } else {
        clearTimeout(trailing);
        trailing = setTimeout(flush, SCROLL_SAVE_THROTTLE_MS - elapsed);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(trailing);
      // Flush the last KNOWN position synchronously on unmount — navigating
      // away (e.g. tapping a row) within the throttle window would
      // otherwise leave the trailing save cancelled with nothing written,
      // so BACK would restore a stale, pre-scroll position. `lastKnownY`
      // here is whatever the last GENUINELY-connected `onScroll` call saw
      // — never a disconnected-root echo, since that call returns early
      // above without touching it.
      flush();
    };
  }, []);

  // Restores at most once per mount (`restoredScrollRef`) — without the
  // guard, a later re-render (e.g. a read-state change) would re-fire this
  // effect and yank the rower back to the saved position mid-browse.
  // `useLayoutEffect`, not `useEffect`: the scroll must land before the
  // browser paints the restored frame, or the rower briefly sees the top
  // of the list flash before it jumps. A fresh tab visit has nothing to
  // restore because `TabBar.tsx`'s own NEWS link clears the saved value
  // first — News itself can't tell a BACK return from a fresh tab tap
  // apart (same reasoning as `libraryScroll.ts`'s own doc comment).
  useLayoutEffect(() => {
    if (!contentSettled || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    const saved = loadNewsScroll();
    if (saved !== null) {
      window.scrollTo(0, saved);
    }
  }, [contentSettled]);

  return (
    <main className="screen news-screen" ref={rootRef}>
      <p className="news-masthead">ERGOMATIC · {mastheadDate(new Date())}</p>
      <div className="news-title-row">
        <h1 className="screen-title">News</h1>
        {reads.state === "ready" && unread > 0 && (
          <span className="news-unread-count">{unread} UNREAD</span>
        )}
      </div>

      <section className="news-pinned" aria-labelledby="news-pinned-h">
        <h2 id="news-pinned-h" className="news-section-label">
          PINNED
        </h2>
        {startHereDismissed && <StartHerePin reads={reads} />}
        {pinnedArticles().map((a) => (
          <ArticleRow key={a.slug} article={a} reads={reads} />
        ))}
      </section>

      <section className="news-latest" aria-labelledby="news-latest-h">
        <h2 id="news-latest-h" className="news-section-label">
          LATEST
        </h2>
        {latestArticles().map((a) => (
          <ArticleRow key={a.slug} article={a} reads={reads} />
        ))}
      </section>

      <section className="news-whatsnew" aria-labelledby="news-whatsnew-h">
        <h2 id="news-whatsnew-h" className="news-section-label">
          WHAT&apos;S NEW
        </h2>
        <p className="news-release-version">
          {latest.version} · {releaseDate(latest.date)}
        </p>
        <ul className="news-release-items">
          {latest.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <Link
          className="news-text-link"
          to="/news/releases"
          state={{ from: "/news" }}
        >
          ALL RELEASE NOTES
        </Link>
      </section>
    </main>
  );
}
