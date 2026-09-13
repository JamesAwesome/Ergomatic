import { useEffect, useState } from "react";
import { api } from "./api";
import { clearArticleReadsCache } from "./api/useArticleReads";

export interface Me {
  id: string;
  email: string;
  name: string;
}

export type MeState =
  { state: "loading" } | { state: "out" } | { state: "in"; user: Me };

export function useMe(): [MeState, () => void, () => void] {
  const [me, setMe] = useState<MeState>({ state: "loading" });
  const [generation, setGeneration] = useState(0);
  // ONE way to become signed out, so the You button's path and the 401 /
  // thrown-fetch paths below cannot diverge on what they forget. The
  // article-reads last-known set is module memory that would otherwise
  // outlive the account: on native the next account signs in inside this
  // same document (`SignInButton` → `refetch()`), and `You.tsx`'s own
  // `clearConcept2Seen` comment records that the 401 path "signs the rower
  // out without calling" the button's cleanup — that fact is safe only
  // because it is keyed by user id; this set has no key, so it is cleared
  // here, at the transition (spec 2026-09-12-news-layout-shift, C4).
  const becomeSignedOut = () => {
    clearArticleReadsCache();
    setMe({ state: "out" });
  };
  const refetch = () => setGeneration((g) => g + 1);

  useEffect(() => {
    let cancelled = false;
    api("/api/me")
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const body = (await res.json()) as { user: Me };
          setMe({ state: "in", user: body.user });
        } else {
          becomeSignedOut();
        }
      })
      .catch(() => {
        if (!cancelled) becomeSignedOut();
      });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  return [me, becomeSignedOut, refetch];
}
