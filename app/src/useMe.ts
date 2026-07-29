import { useEffect, useState } from "react";
import { api } from "./api";

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
  const signedOut = () => setMe({ state: "out" });
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
          setMe({ state: "out" });
        }
      })
      .catch(() => {
        if (!cancelled) setMe({ state: "out" });
      });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  return [me, signedOut, refetch];
}
