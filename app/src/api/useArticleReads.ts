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
      // symmetric case: nothing to undo, nothing to tell the server). That
      // surface left with #181; the function stays, with its tests.
      markUnread: (slug: string) => void; // optimistic; fires DELETE, failure is silent
    };

// Read-after-write barrier (2026-08-12). Every `useArticleReads()` call is
// its own hook instance with its own mount GET, and `markRead`/`markUnread`
// are deliberately fire-and-forget — so a rower who opens an article and
// immediately taps a tab can have the NEW screen's GET overtake the still
// in-flight PUT and render the stale count. That is a real (if cosmetic and
// self-healing) product bug, and it is what made `onboarding.spec.ts`'s
// cross-surface read step intermittently see "0 OF 4 READ" on a loaded CI
// runner — the test was right, the app was racing.
//
// Writes register here; a mount GET waits for them to settle first. This
// makes the barrier honest rather than optimistic: if the PUT actually
// FAILED, the GET that follows reports the truth (still unread) instead of
// a local guess. Two passes, because a write can start while we await the
// first — bounded rather than a `while`, so a stream of writes can never
// keep a screen loading forever.
const pendingWrites = new Set<Promise<unknown>>();

function trackWrite(write: Promise<unknown>): void {
  pendingWrites.add(write);
  const done = () => {
    pendingWrites.delete(write);
  };
  write.then(done, done);
}

async function settlePendingWrites(): Promise<void> {
  for (let pass = 0; pass < 2 && pendingWrites.size > 0; pass++) {
    await Promise.allSettled([...pendingWrites]);
  }
}

// The last-known set (spec 2026-09-12-news-layout-shift §3). Module state
// beside the barrier, with the same lifetime — this document, never a
// reload. A mount that finds it warm renders `ready` from it synchronously
// and refetches in the background, so the seven squares and the count stop
// popping in on every tab switch; only the first News/Reader visit of a
// document still waits for the fetch. The server stays the authority: this
// is only ever a copy of a response it sent or a write we sent it.
//
// LIFETIME (RF27):
//   lastKnown   minted by the first OK GET; updated by every OK GET whose
//               epoch still matches (C3) and by every markRead/markUnread
//               (C2); cleared by every transition to signed-out in
//               `useMe.ts` and by any non-OK GET (C4).
//   writeEpoch  +1 per markRead/markUnread; compared, never reset.
//   listeners   add in the mount effect, delete in its cleanup — so no
//               listener ever reaches an unmounted instance.
let lastKnown: ReadonlySet<string> | null = null;
let writeEpoch = 0;
const listeners = new Set<(slugs: ReadonlySet<string>) => void>();

function publish(next: ReadonlySet<string>): void {
  lastKnown = next;
  for (const listener of listeners) listener(next);
}

/** Forget the last-known set. Called by `useMe.ts` on every transition to
 *  signed-out (the You button AND the 401 path — on native the next account
 *  signs in inside this same document, so an uncleared set would show the
 *  previous account's squares for one round trip). */
export function clearArticleReadsCache(): void {
  lastKnown = null;
}

// Module functions, not per-instance closures: they act on `lastKnown` and
// publish to every mounted instance in the same tick (invariant C2). The
// side effects happen HERE, outside any `setState` updater, which is the
// property the StrictMode note used to guard per instance: a double-invoked
// render replays nothing, because the render only reads.
function markRead(slug: string): void {
  if (lastKnown === null || lastKnown.has(slug)) return;
  const next = new Set(lastKnown);
  next.add(slug);
  writeEpoch++;
  // Fire-and-forget: read state is a nicety. A failed PUT simply leaves the
  // article unread on the next reconciling read (6H spec).
  trackWrite(
    api(`/api/article-reads/${slug}`, { method: "PUT" }).catch(() => {}),
  );
  publish(next);
}

function markUnread(slug: string): void {
  if (lastKnown === null || !lastKnown.has(slug)) return;
  const next = new Set(lastKnown);
  next.delete(slug);
  writeEpoch++;
  // Same nicety-class failure handling as markRead, mirrored: a failed
  // DELETE simply leaves the article read on the next reconciling read.
  trackWrite(
    api(`/api/article-reads/${slug}`, { method: "DELETE" }).catch(() => {}),
  );
  publish(next);
}

function readyFrom(slugs: ReadonlySet<string>): ArticleReadsState {
  return { state: "ready", readSlugs: slugs, markRead, markUnread };
}

// One GET behind the barrier. "stale" is invariant C3: a write was issued
// after this GET went out (the epoch moved), so the response may predate it
// — a set that would flip the article the rower just opened back to unread.
// An emptiness check on `pendingWrites` cannot see this case, because the
// write can SETTLE before the slow GET returns; comparing against what we
// sent is the only value that decides the ordering.
async function fetchOnce(): Promise<"applied" | "stale" | "refused"> {
  await settlePendingWrites();
  const issuedAt = writeEpoch;
  const res = await api("/api/article-reads");
  if (!res.ok) return "refused";
  const { slugs } = (await res.json()) as { slugs: string[] };
  if (writeEpoch !== issuedAt) return "stale";
  publish(new Set(slugs));
  return "applied";
}

export function useArticleReads(): ArticleReadsState {
  const [state, setState] = useState<ArticleReadsState>(() =>
    lastKnown === null ? { state: "loading" } : readyFrom(lastKnown),
  );

  useEffect(() => {
    let cancelled = false;
    const listener = (slugs: ReadonlySet<string>) => {
      setState(readyFrom(slugs));
    };
    listeners.add(listener);

    // `publish` is deliberately NOT gated on `cancelled`: a server response
    // is the truth whoever asked for it, and an unmounted instance's GET
    // still updates the module set and whichever instance is mounted now.
    // `cancelled` gates only this instance's own error state, as before.
    void (async () => {
      try {
        let outcome = await fetchOnce();
        // Re-issue ONCE on a stale response; a second stale response is
        // dropped and the next mount reconciles — bounded, like the barrier.
        if (outcome === "stale") outcome = await fetchOnce();
        if (outcome === "refused") {
          // A session the server no longer honours (401): the set must not
          // outlive it (C4). Cold behaviour from here — today's `error`.
          clearArticleReadsCache();
          if (!cancelled) setState({ state: "error" });
        }
      } catch {
        // Network failure or a malformed body. A warm instance keeps
        // showing the last-known set — that is the case it exists for; a
        // cold one reports error exactly as before.
        if (!cancelled && lastKnown === null) setState({ state: "error" });
      }
    })();

    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);

  return state;
}
