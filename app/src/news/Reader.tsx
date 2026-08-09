import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import BackLink from "../shell/BackLink";
import { useArticleReads } from "../api/useArticleReads";
import { articleBySlug, nextUnreadSlug } from "./content/articles";
import { updatedLabel } from "./newsDates";
import { useReadingOrigin } from "./useReadingOrigin";

// The in-app reader (Phase 6H Task 6). Unknown slugs and linked-kind slugs
// (no first-party body to read) both redirect home rather than rendering a
// broken page — a linked article has nowhere sensible to send a rower who
// lands on /news/<its-slug> directly, since its whole point is to open an
// external browser tab instead.
export default function Reader() {
  const { slug } = useParams();
  const reads = useArticleReads();
  // Called unconditionally, above the early return below (rules-of-hooks) —
  // same reason the pre-extraction code read `useLocation()` up here too.
  const rawFrom = useReadingOrigin();
  const article = slug ? articleBySlug(slug) : undefined;

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

  // ui-notes round, item 1 (extracted into `useReadingOrigin`, crosslink
  // round, so `ArticleLink`'s cross-link hop can carry forward the exact
  // same un-fallback-substituted value NEXT does): `origin` is the ONE
  // resolved value both BACK (via BackLink, below) and the ✕ close control
  // consume — they can never independently drift on what "leaving this
  // screen" means. `rawFrom` (read above, before the early return —
  // rules-of-hooks) is what NEXT threads forward: carrying the
  // already-resolved `origin` ("/news" once substituted) would silently
  // turn "no origin was ever recorded" into "the origin is literally
  // /news" for every later hop in the chain — harmless today (the
  // fallback IS /news) but no longer a fallback if Reader's own default
  // ever changes.
  const origin = rawFrom ?? "/news";

  return (
    // Round 4 (architectural): scrolls in its own element — see
    // .overlay-screen's comment in index.css for why. `key={article.slug}`
    // forces a fresh DOM node (fresh scroller, position 0) on every NEXT
    // navigation instead of reusing this one mid-scroll. `tabIndex={0}`
    // matches Plan.tsx's 84-row sequence (Phase 6A, commit a3e5ee6): it
    // puts the scroll region itself in the tab order so a keyboard user can
    // Tab to it and scroll with arrow/Page keys — genuinely useful here,
    // not required by axe's scrollable-region-focusable rule, which this
    // screen would already satisfy via BackLink, its own focusable
    // descendant (`focusable-content`), tabIndex or not.
    <main
      className="screen reader-screen overlay-screen"
      key={article.slug}
      tabIndex={0}
    >
      {/* ui-notes round, item 1: BACK and the new ✕ close share a header row
          so both resolve to the same `origin` (computed once above) and
          sit at the same visual height, James's explicit ask for a second
          way to leave the reader. `.today-unlogged-discard` is Today's own
          44px icon-control idiom (Today.tsx, ui-fix round Task 3) reused
          wholesale rather than a second hand-rolled version of the same
          pattern (recurring-failure #8) — `.reader-close` adds only
          placement, no new visual language. */}
      <div className="reader-header">
        <BackLink fallback="/news" />
        <Link
          to={origin}
          className="today-unlogged-discard reader-close"
          aria-label="Close"
        >
          ✕
        </Link>
      </div>
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
          replace
          state={rawFrom ? { from: rawFrom } : undefined}
        >
          NEXT · {next.minutes} MIN · {next.title}
        </Link>
      )}
    </main>
  );
}
