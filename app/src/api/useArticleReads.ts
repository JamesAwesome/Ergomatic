import { useEffect, useState } from "react";
import { api } from "../api";

export type ArticleReadsState =
  | { state: "loading" }
  | { state: "error" } // News/Reader render content normally, suppress unread claims
  | {
      state: "ready";
      readSlugs: ReadonlySet<string>;
      markRead: (slug: string) => void; // optimistic; fires PUT, failure is silent
    };

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
