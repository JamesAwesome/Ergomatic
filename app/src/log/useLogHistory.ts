import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { RecentLog } from "../api/useRecentLogs";

// From-the-log spec (2026-08-18), §1/§3: the history list's own page
// size — "cursor-paginated (page size 30, loads more on scroll)".
export const LOG_HISTORY_PAGE_SIZE = 30;

export type LogHistoryState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | {
      state: "ready";
      logs: RecentLog[];
      loadMore: () => void;
      exhausted: boolean;
    };

/** `/today/log`'s own fetch — `useRecentLogs`' state-machine idiom
 *  (loading/error/ready), extended with cursor pagination: `ready` also
 *  carries `loadMore` and `exhausted`. The cursor is the last-loaded row's
 *  own opaque `id` (spec §3 — the timestamp never round-trips through the
 *  client), so `loadMore` needs no argument.
 *
 *  `logs`/`exhausted` are plain `useState`, but `loadMore` itself reads
 *  their CURRENT values through refs kept in sync by a couple of trailing
 *  effects, not through a `useState` updater's return value — an updater
 *  fired for its side effect (the fetch) rather than to compute new state
 *  would run the fetch TWICE under StrictMode's deliberate double-invoke
 *  (React requires updaters to stay pure), which refs sidestep entirely.
 *  `fetchingMoreRef` further guards against two overlapping requests from
 *  a rower who scrolls past the trigger point more than once before the
 *  first page lands. */
export function useLogHistory(): LogHistoryState {
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [logs, setLogs] = useState<RecentLog[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [generation, setGeneration] = useState(0);

  const logsRef = useRef<RecentLog[]>([]);
  const exhaustedRef = useRef(false);
  const fetchingMoreRef = useRef(false);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);
  useEffect(() => {
    exhaustedRef.current = exhausted;
  }, [exhausted]);

  useEffect(() => {
    // No `setPhase("loading")` reset here, matching `useRecentLogs`'
    // exact idiom: the initial `useState` already starts at "loading",
    // and a `retry()`-driven re-run leaves whatever's currently rendered
    // (the error screen) up until the new fetch resolves rather than
    // flashing back to a loading state.
    let cancelled = false;
    api(`/api/logs?limit=${LOG_HISTORY_PAGE_SIZE}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const page = (await res.json()) as RecentLog[];
          setLogs(page);
          setExhausted(page.length < LOG_HISTORY_PAGE_SIZE);
          setPhase("ready");
        } else {
          setPhase("error");
        }
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [generation]);

  const retry = useCallback(() => setGeneration((g) => g + 1), []);

  const loadMore = useCallback(() => {
    if (fetchingMoreRef.current || exhaustedRef.current) return;
    const cursor = logsRef.current[logsRef.current.length - 1]?.id;
    if (cursor === undefined) return;
    fetchingMoreRef.current = true;
    api(`/api/logs?limit=${LOG_HISTORY_PAGE_SIZE}&before=${cursor}`)
      .then(async (res) => {
        fetchingMoreRef.current = false;
        // A failed page fetch is silently retryable (the rower can keep
        // scrolling / the next near-bottom tick tries again) rather than
        // flipping the whole screen to the "error" state and discarding
        // every row already on screen — `phase`/`state` only ever
        // describes the INITIAL fetch.
        if (!res.ok) return;
        const more = (await res.json()) as RecentLog[];
        setLogs((prev) => [...prev, ...more]);
        setExhausted(more.length < LOG_HISTORY_PAGE_SIZE);
      })
      .catch(() => {
        fetchingMoreRef.current = false;
      });
  }, []);

  if (phase === "loading") return { state: "loading" };
  if (phase === "error") return { state: "error", retry };
  return { state: "ready", logs, loadMore, exhausted };
}
