import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

/** The client's own view of `GET /api/concept2/link`
 *  (`server/routes/concept2.ts`, the `router.get("/api/concept2/link")`
 *  handler), declared here rather than imported from the server, per this
 *  codebase's standing convention for client hooks (`api/useRecentLogs.ts`'s
 *  `RecentLog` and its comment). NEVER a token: that response carries none,
 *  by construction — the handler's own comment reads "Still no token on this
 *  response — only the numeric account id."
 *
 *  Every field is required-and-nullable rather than optional. The route
 *  returns three different shapes and a client that told them apart by
 *  `undefined` would read a flag-off server (`{available:false}`, HTTP
 *  200) exactly like an unlinked one — the trap `Concept2LinkProbe.tsx`
 *  already names. `normalizeLink` below collapses all three into one total
 *  shape so no consumer has to. */
export interface Concept2Link {
  available: boolean;
  linked: boolean;
  // NO `weightClass`. Ruling (i): the class is Concept2's fact, derived
  // server-side at send time and never stored or shown by us. The route
  // stops emitting the key in Task 3 and this shape never declared it —
  // `normalizeLink` drops one an unrestarted server instance still sends.
  c2UserId: number | null;
  c2Username: string | null;
  needsReauth: boolean;
  /** The Concept2 ORIGIN this deployment talks to, echoed from the
   *  server's own `C2_BASE_URL` (`server/index.ts`). The client cannot
   *  know whether it is `log.concept2.com` or `log-dev.concept2.com`, and
   *  a hardcoded guess 404s the View-on-Concept2 link-out for the whole
   *  sandbox phase (plan observation 5). */
  logbookBaseUrl: string | null;
}

export const LINK_UNAVAILABLE: Concept2Link = {
  available: false,
  linked: false,
  c2UserId: null,
  c2Username: null,
  needsReauth: false,
  logbookBaseUrl: null,
};

export function normalizeLink(body: unknown): Concept2Link {
  if (typeof body !== "object" || body === null) return LINK_UNAVAILABLE;
  const raw = body as Record<string, unknown>;
  if (raw.available !== true) return LINK_UNAVAILABLE;
  if (raw.linked !== true) return { ...LINK_UNAVAILABLE, available: true };
  return {
    available: true,
    linked: true,
    c2UserId: typeof raw.c2UserId === "number" ? raw.c2UserId : null,
    // `!== ""` as well as `typeof`, because ABSENT, EMPTY and VALUED are
    // three cases and only two of them are a username. Concept2's
    // `/users/me` documents `username` optional; `client.ts`'s `fetchMe`
    // passes any string through, empty included (observation 18). An
    // empty string here would render "Concept2  · Ergomatic james@…",
    // which is the account-injection mitigation rendering a blank where
    // it is supposed to name an account.
    c2Username:
      typeof raw.c2Username === "string" && raw.c2Username !== ""
        ? raw.c2Username
        : null,
    needsReauth: raw.needsReauth === true,
    // The SAME absent/empty/valued treatment as `c2Username` one field up,
    // and for a sharper reason: `server/index.ts` reads
    // `process.env.C2_BASE_URL || "https://log-dev.concept2.com"`, and a
    // `""` that reached here anyway would build
    // `/profile/2211/log/339` — a RELATIVE url, which the web arm opens as
    // a new tab on ERGOMATIC's own origin and the native arm hands to
    // `SFSafariViewController` as a bare path. A link-out that silently
    // points at ourselves is worse than no link-out, so `""` degrades to
    // `null` and the button does not render.
    logbookBaseUrl:
      typeof raw.logbookBaseUrl === "string" && raw.logbookBaseUrl !== ""
        ? raw.logbookBaseUrl
        : null,
  };
}

/** Why a read failed, in the only terms the card can show a rower.
 *  `status` is the HTTP status the read came back with, or `null` when the
 *  request never completed at all (offline, DNS, an aborted fetch). It
 *  exists because a card that says only "something went wrong" costs a
 *  walk: `LinkOutcome` already learned that lesson (the REASON lines), and
 *  the read is the one hop that had no discriminator. */
export interface LinkReadFailure {
  status: number | null;
}

/**
 * Reads the link on mount, on demand, and whenever the document comes back
 * in front of the rower.
 *
 * There is deliberately NO `setLink`. Invariant I1 says the card never
 * infers the link from a `LinkOutcome`, and a setter is the one affordance
 * that would let a future caller do exactly that. Every write to `link`
 * goes through `reload()`, which reads the server.
 *
 * `.then`/`.catch` at the EFFECT boundary rather than an `async` effect
 * body, and NOT stylistic: `react-hooks/set-state-in-effect`
 * (`eslint.config.js`) rejects an effect that reaches a `setState`
 * synchronously, which an `async` function's pre-`await` body is. The
 * effect's first synchronous statement is `api(...)`, so the rule is
 * satisfied; the `.then` CALLBACK being `async` is fine, since it runs a
 * microtask later. This is the repo's own mount-fetch idiom
 * (`WorkoutDetail.tsx`, `Concept2LinkProbe.tsx`'s `readStatus`).
 *
 * `api()` does not throw on a non-2xx (`src/api.ts`), so a 401 or a 502
 * arrives here as an ordinary resolution and is turned into a failure
 * explicitly. THREE outcomes, not two, because a 200 whose body is not
 * JSON is a real case (a proxy or an old image answering an HTML error
 * page mid rolling deploy — `adapters/linkFlow.ts`'s `readError` names it):
 * the parse is caught SEPARATELY so it reports the status the response
 * genuinely carried. Letting it fall to the outer `.catch` would print
 * REASON: NO CONNECTION over a request that plainly connected.
 *
 * `failed` exists because a dropped request must not leave a stale `link`
 * on screen reading as a state nobody observed. It is NOT the same thing
 * as `available: false`: the server saying "this deployment has no
 * Concept2" is a capability answer and renders nothing, while a read that
 * failed is a fault the rower can retry (Gate 0 amendment 1h vs 1i).
 *
 * `pageshow` and `visibilitychange` (invariant I5, observation 19): the
 * web arm's `startLink` unloads the document, and the rower comes back by
 * Back. A browser that RESTORES the page from the back-forward cache runs
 * no mount, so a mount-only read leaves a buttonless OPENING CONCEPT2
 * panel over a link that already succeeded. `pageshow` is the one event
 * that fires on a restore as well as on a load. Both listeners are purely
 * additive: if neither ever fires, this hook behaves exactly as a
 * mount-only read, so nothing depends on their availability.
 */
export function useConcept2Link(): {
  link: Concept2Link | null;
  failed: LinkReadFailure | null;
  reload: () => Promise<void>;
} {
  const [link, setLink] = useState<Concept2Link | null>(null);
  const [failed, setFailed] = useState<LinkReadFailure | null>(null);

  const reload = useCallback(
    () =>
      api("/api/concept2/link")
        .then(async (res) => {
          if (!res.ok) {
            setFailed({ status: res.status });
            return;
          }
          let body: unknown;
          try {
            body = (await res.json()) as unknown;
          } catch {
            setFailed({ status: res.status });
            return;
          }
          setLink(normalizeLink(body));
          setFailed(null);
        })
        .catch(() => {
          setFailed({ status: null });
        }),
    [],
  );

  useEffect(() => {
    void reload();
    const onPageShow = () => void reload();
    const onVisibility = () => {
      // Only on the way BACK IN. Re-reading as the document hides would
      // fire a request nobody is waiting for and, on the web arm, would
      // race the unload the OAuth hop is in the middle of.
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);

  return { link, failed, reload };
}
