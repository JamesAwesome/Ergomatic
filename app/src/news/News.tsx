import { Link } from "react-router-dom";
import type { WorkoutType } from "../../domain/types.js";
import TypeBadge from "../components/TypeBadge";
import { useArticleReads } from "../api/useArticleReads";
import type { ArticleReadsState } from "../api/useArticleReads";
import {
  latestArticles,
  pinnedArticles,
  unreadCount,
} from "./content/articles";
import { RELEASE_NOTES } from "./content/releaseNotes";
import type { NewsArticle } from "./content/types";
import { mastheadDate, releaseDate } from "./newsDates";

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

export default function News() {
  const reads = useArticleReads();
  const latest = RELEASE_NOTES[0]!;
  const unread = reads.state === "ready" ? unreadCount(reads.readSlugs) : 0;

  return (
    <main className="screen news-screen">
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
        {pinnedArticles().map((a) => (
          <ArticleRow key={a.slug} article={a} reads={reads} />
        ))}
      </section>

      <section aria-labelledby="news-latest-h">
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
