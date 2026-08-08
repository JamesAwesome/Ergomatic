import { useEffect, useLayoutEffect } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import BackLink from "../shell/BackLink";
import { holdScrollTop } from "../shell/holdScrollTop";
import { useArticleReads } from "../api/useArticleReads";
import { articleBySlug, nextUnreadSlug } from "./content/articles";
import { updatedLabel } from "./newsDates";

// The in-app reader (Phase 6H Task 6). Unknown slugs and linked-kind slugs
// (no first-party body to read) both redirect home rather than rendering a
// broken page — a linked article has nowhere sensible to send a rower who
// lands on /news/<its-slug> directly, since its whole point is to open an
// external browser tab instead.
export default function Reader() {
  const { slug } = useParams();
  const location = useLocation();
  const reads = useArticleReads();
  const article = slug ? articleBySlug(slug) : undefined;

  // Scroll-to-top, round 3: see holdScrollTop's comment for why a single
  // scrollTo isn't enough on real iOS WebKit. Keyed on the slug because the
  // NEXT footer navigates within this same mounted component.
  useLayoutEffect(() => holdScrollTop(), [article?.slug]);

  // Mark read once ready — in an effect keyed on (reads.state, article.slug)
  // per the brief: markRead is stable per ready-state, so keying on state +
  // slug is enough, and the `reads.state === "ready"` guard is what keeps
  // this from ever firing while loading (there's no markRead to call on
  // that variant anyway). Also gated on `article.kind === "first-party"`
  // (review finding): this effect runs on every render, including the one
  // where the component is about to redirect for an unknown or linked-kind
  // slug — without this half of the guard, a hand-typed/shared
  // `/news/<linked-slug>` URL would mark that article read despite the
  // rower only ever seeing the redirect, never the content.
  useEffect(() => {
    if (reads.state === "ready" && article?.kind === "first-party") {
      reads.markRead(article.slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reads.state, article?.slug, article?.kind]);

  if (!article || article.kind !== "first-party") {
    return <Navigate to="/news" replace />;
  }

  const next =
    reads.state === "ready"
      ? articleBySlug(nextUnreadSlug(article.slug, reads.readSlugs) ?? "")
      : undefined;

  return (
    <main className="screen reader-screen">
      <BackLink fallback="/news" />
      <p className="reader-meta">
        ERGOMATIC · {article.minutes} MIN
        {article.updatedAt && ` · UPDATED ${updatedLabel(article.updatedAt)}`}
      </p>
      <h1 className="reader-title">{article.title}</h1>
      <article className="reader-body">{article.body}</article>
      {next && (
        <Link
          className="reader-next"
          to={`/news/${next.slug}`}
          state={{ from: location.pathname }}
        >
          NEXT · {next.minutes} MIN — {next.title}
        </Link>
      )}
    </main>
  );
}
