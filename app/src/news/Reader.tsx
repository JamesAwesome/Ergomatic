import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useArticleReads } from "../api/useArticleReads";
import { articleBySlug, nextUnreadSlug } from "./content/articles";
import { updatedLabel } from "./newsDates";
import { useReadingTrail } from "./useReadingTrail";

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
  const { trail, back, origin: rawOrigin } = useReadingTrail();
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

  // BACK-walks-the-stack round: BACK and ✕ now resolve DIFFERENT targets,
  // which is the whole point (James's report 2 — ← BACK from a cross-linked
  // article used to jump straight to Today instead of the previous
  // article). ✕ resolves the fallback-substituted `origin` from
  // `useReadingTrail` ("/news" once substituted) — carrying that resolved
  // value forward instead of `rawOrigin` (undefined until an origin is
  // actually known) would silently turn "no origin was ever recorded" into
  // "the origin is literally /news" for every later hop, which is why NEXT
  // below threads `rawOrigin`, not this resolved `origin`.
  const origin = rawOrigin ?? "/news";
  const backTarget = back ?? "/news";
  // The article being LEFT — appended to `trail` for a FORWARD hop (NEXT).
  // Built from `article.slug` rather than read via `useLocation()` because
  // it's always exactly this: Reader is only ever mounted at
  // `/news/:slug`.
  const currentPath = `/news/${article.slug}`;
  // ← BACK doesn't call real browser history.back() — it PUSHES a fresh
  // entry to `backTarget`, same as every other in-app control, so it works
  // even when this article wasn't reached by a real navigation. That means
  // a SECOND ← BACK press (from the article it lands on) needs its OWN
  // back-chain re-supplied explicitly: popping `back` (already `trail`'s
  // own last element) off and forwarding the remainder is exactly what
  // reconstructs the target article's ORIGINAL incoming trail, letting
  // repeated presses retrace the whole stack one article at a time — real
  // browser BACK gets this for free (each pushed entry already carries its
  // own originally-pushed trail); this hand-rolled control has to rebuild
  // it.
  const backTrail = trail.slice(0, -1);

  return (
    // Round 4 (architectural): scrolls in its own element — see
    // .overlay-screen's comment in index.css for why. `key={article.slug}`
    // forces a fresh DOM node (fresh scroller, position 0) on every NEXT
    // navigation instead of reusing this one mid-scroll. `tabIndex={0}`
    // matches Plan.tsx's 84-row sequence (Phase 6A, commit a3e5ee6): it
    // puts the scroll region itself in the tab order so a keyboard user can
    // Tab to it and scroll with arrow/Page keys — genuinely useful here,
    // not required by axe's scrollable-region-focusable rule, which this
    // screen would already satisfy via its own ← BACK link, a focusable
    // descendant, tabIndex or not.
    <main
      className="screen reader-screen overlay-screen"
      key={article.slug}
      tabIndex={0}
    >
      {/* ui-notes round, item 1: BACK and the new ✕ close share a header row
          and sit at the same visual height, James's explicit ask for a
          second way to leave the reader — BACK-walks-the-stack round: they
          now deliberately resolve DIFFERENT targets (BACK the previous
          article, ✕ the true origin), not "the same `origin`" any more.
          `.today-unlogged-discard` is Today's own 44px icon-control idiom
          (Today.tsx, ui-fix round Task 3) reused wholesale rather than a
          second hand-rolled version of the same pattern (recurring-failure
          #8) — `.reader-close` adds only placement, no new visual
          language. */}
      <div className="reader-header">
        {/* Not the shared `<BackLink>`: that component's `{from}` contract
            has no notion of a walkable multi-article trail (it's built for
            the app's ordinary single-hop screens). `back` is undefined
            exactly when there's nothing to retrace to (the fallback case
            below carries no `state` at all — no trail to reconstruct if
            there was never a trail in the first place). */}
        <Link
          to={backTarget}
          state={back ? { trail: backTrail, origin: rawOrigin } : undefined}
          className="back-link"
        >
          ← BACK
        </Link>
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
      {/* BACK-walks-the-stack round: NEXT now PUSHES (no `replace`) — one
          browser BACK from the next article lands back on THIS one, not on
          the origin. `trail` grows by THIS article's own path (the next
          hop's own `back` target); `origin` threads `rawOrigin` through
          unchanged, hop to hop, regardless of whether it was ever known —
          `ArticleLink`'s cross-link hop carries the identical `{trail,
          origin}` shape, so a NEXT/cross-link mix never drops either
          half. */}
      {next && (
        <Link
          className="reader-next"
          to={`/news/${next.slug}`}
          state={{ trail: [...trail, currentPath], origin: rawOrigin }}
        >
          NEXT · {next.minutes} MIN · {next.title}
        </Link>
      )}
    </main>
  );
}
