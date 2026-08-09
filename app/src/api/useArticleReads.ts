import { useEffect, useState } from "react";
import { api } from "../api";

export type ArticleReadsState =
  | { state: "loading" }
  | { state: "error" } // News/Reader render content normally, suppress unread claims
  | {
      state: "ready";
      readSlugs: ReadonlySet<string>;
      markRead: (slug: string) => void; // optimistic; fires PUT, failure is silent
      // Phase 6I: You › Learning the app's "MARK ALL FOUR UNREAD" — same
      // silence rules as markRead, mirrored the other direction. No call at
      // all for a slug that isn't currently read (no PUT-on-already-read's
      // symmetric case: nothing to undo, nothing to tell the server).
      markUnread: (slug: string) => void; // optimistic; fires DELETE, failure is silent
    };

export function useArticleReads(): ArticleReadsState {
  const [state, setState] = useState<ArticleReadsState>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    // Minor #1 (6H close-out): a mutable snapshot of the ready `readSlugs`,
    // kept OUTSIDE React state. The guard (has/hasn't) and the PUT/DELETE
    // fire against THIS, before `setState` is ever called — a StrictMode
    // double-invoke of the setState updater below can only ever replay the
    // SAME already-computed `next` Set, never recompute the guard or refire
    // the request. The updater itself is now pure: given the same `prev` it
    // always produces the same `next`, with no side effect inside it.
    let currentSlugs: Set<string> | null = null;

    const markRead = (slug: string) => {
      if (currentSlugs === null || currentSlugs.has(slug)) return;
      currentSlugs = new Set(currentSlugs);
      currentSlugs.add(slug);
      // Fire-and-forget: read state is a nicety. A failed PUT simply
      // leaves the article unread on the next fetch (6H spec).
      void api(`/api/article-reads/${slug}`, { method: "PUT" }).catch(() => {});
      const next = currentSlugs;
      // The `prev.state !== "ready"` arm is required for TypeScript to
      // narrow `prev` before the spread (the ready variant is the only one
      // with a `readSlugs` field) — not reachable at runtime today, since
      // this hook's own effect runs exactly once (`[]` deps, no retry) and
      // so has no path that could ever move `state` away from "ready" once
      // entered. Same shape (and same reasoning) as usePreferences.ts's
      // `save`.
      setState((prev) =>
        prev.state !== "ready" ? prev : { ...prev, readSlugs: next },
      );
    };

    const markUnread = (slug: string) => {
      if (currentSlugs === null || !currentSlugs.has(slug)) return;
      currentSlugs = new Set(currentSlugs);
      currentSlugs.delete(slug);
      // Same nicety-class failure handling as markRead, mirrored: a failed
      // DELETE simply leaves the article read on the next fetch.
      void api(`/api/article-reads/${slug}`, { method: "DELETE" }).catch(
        () => {},
      );
      const next = currentSlugs;
      setState((prev) =>
        prev.state !== "ready" ? prev : { ...prev, readSlugs: next },
      );
    };

    api("/api/article-reads")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const { slugs } = (await res.json()) as { slugs: string[] };
          currentSlugs = new Set(slugs);
          setState({
            state: "ready",
            readSlugs: currentSlugs,
            markRead,
            markUnread,
          });
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
