import { useCallback, useEffect, useRef, useState } from "react";
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
  /** Wave E auto-send §3.1: the sending mode. `true` = AUTOMATIC (a finished
   *  monitor row is sent the moment it saves); `false` = MANUAL (today's
   *  per-row Send). Read as `raw.autoSend === true` — absent, unreadable,
   *  `"true"`, `1` all read false (A2): the only way to be automatic is a
   *  literal `true` from the server. */
  autoSend: boolean;
  /** Phase AV: whether the monitor's verification code rides along, so
   *  Concept2 marks the row verified at receipt. Same `=== true` reading as
   *  `autoSend` above and for a sharper reason: a server that predates the
   *  column sends no key, and reading that as ON would verify rows for a
   *  rower who never asked — the regression #337 reverted. */
  autoVerify: boolean;
  /** The sticky "sends are failing" flag (rulings 6, 7): the ISO instant of
   *  the last eligible send refused for want of a weight class, and its
   *  SUB-reason (`no_weight` | `unreadable_weight` | `implausible_weight` |
   *  `no_gender` — the key the You screen's sentence is chosen by). Both
   *  null when the last send landed or Concept2 already had the row. Read by
   *  the You row (`SEND FAILED`), the card's pill, and the screen's mode
   *  line; never by the send block. */
  sendFailedAt: string | null;
  sendFailedReason: string | null;
}

/** The answer for "this deployment has no Concept2" — amendment 1h, which
 *  renders NOTHING at all. It is also what a body we cannot read degrades
 *  to, so a corruption here does not fail loudly: flipping `available` to
 *  `true` would put the whole Concept2 card on a flag-off deployment, and
 *  the only consumer that can catch it is a test asserting all nine fields
 *  as literals (review F2 — `useConcept2Link.test.ts`'s
 *  "LINK_UNAVAILABLE is the flag-off answer"). */
export const LINK_UNAVAILABLE: Concept2Link = {
  available: false,
  linked: false,
  c2UserId: null,
  c2Username: null,
  needsReauth: false,
  logbookBaseUrl: null,
  autoSend: false,
  autoVerify: false,
  sendFailedAt: null,
  sendFailedReason: null,
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
    // `/profile/2211/log/339` — a RELATIVE url. After PR B both platforms
    // share one arm (`adapters/externalBrowser.ts`'s `openReadOnlyUrl`), and
    // a relative url opens as a new tab on ERGOMATIC's own origin regardless
    // of platform. A link-out that silently points at ourselves is worse
    // than no link-out, so `""` degrades to `null` and the button does not
    // render.
    logbookBaseUrl:
      typeof raw.logbookBaseUrl === "string" && raw.logbookBaseUrl !== ""
        ? raw.logbookBaseUrl
        : null,
    // Wave E auto-send: `=== true`, not truthiness — a server that predates
    // the column sends no key and must read MANUAL, and a stray `"true"` or
    // `1` must not put a rower on AUTOMATIC (A2, fail-closed by construction).
    autoSend: raw.autoSend === true,
    // Phase AV: `=== true` for the same fail-closed reason.
    autoVerify: raw.autoVerify === true,
    // ABSENT, EMPTY, VALUED — the same three-case treatment as the two
    // strings above; an empty instant or reason is not a flag.
    sendFailedAt:
      typeof raw.sendFailedAt === "string" && raw.sendFailedAt !== ""
        ? raw.sendFailedAt
        : null,
    sendFailedReason:
      typeof raw.sendFailedReason === "string" && raw.sendFailedReason !== ""
        ? raw.sendFailedReason
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

/** ONE read of `GET /api/concept2/link`, parsed — the hook's own read, and
 *  the read `log/concept2Send.ts`'s `autoSendAfterSave` takes after a 201
 *  (Wave E auto-send §3.3: the decision is made on a FRESH answer, never on
 *  a mount-time snapshot). `failed` carries the status the way the hook's
 *  `failed` state does; `null` status means the request never completed.
 *  Never throws. */
export async function fetchLink(): Promise<
  { link: Concept2Link } | { failed: LinkReadFailure }
> {
  try {
    const res = await api("/api/concept2/link");
    if (!res.ok) return { failed: { status: res.status } };
    let body: unknown;
    try {
      body = (await res.json()) as unknown;
    } catch {
      return { failed: { status: res.status } };
    }
    return { link: normalizeLink(body) };
  } catch {
    return { failed: { status: null } };
  }
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
 * `failed` and `link` are INDEPENDENT, and a failed re-read deliberately
 * leaves the last good `link` in place rather than clearing it. Amendment
 * 1i owns that rule: it draws a failed read as its own panel
 * (COULDN'T READ CONCEPT2, a REASON line, a Retry) and the card branches on
 * `failed` BEFORE it renders any link state, so a retained `link` is never
 * on screen while `failed` is set. Clearing it would throw away the only
 * thing a successful Retry can restore, and would make a transient 502 look
 * like an unlink. `failed` is also NOT the same thing as `available: false`:
 * the server saying "this deployment has no Concept2" is a capability answer
 * and renders nothing (1h), while a read that failed is a fault the rower
 * can retry (1i).
 *
 * A newer read always wins, whatever order the answers arrive in. Foreground
 * can fire `pageshow` and `visibilitychange` back to back, so two reads are
 * genuinely in flight at once; without the generation ref below, the SLOWER
 * of them applies last and a stale answer overwrites a fresh one (review
 * F7). The ref is bumped at the START of every request and each response
 * checks it is still the newest before touching state.
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
  /** Reads the link and applies it. Resolves once the read has been applied
   *  (or dropped as superseded / recorded as failed); the VALUE is not
   *  exposed — a caller that must decide on a fresh answer takes its own
   *  `fetchLink()` (Wave E auto-send §3.3, `log/concept2Send.ts`), and a
   *  widened return here had no reader (harden lens 1 F4, RF29). */
  reload: () => Promise<void>;
} {
  const [link, setLink] = useState<Concept2Link | null>(null);
  const [failed, setFailed] = useState<LinkReadFailure | null>(null);
  /** Monotonic per-request token. A ref, not state: bumping it must not
   *  re-render, and every read has to see the value the PREVIOUS read wrote
   *  in the same tick. Lifetime: minted once per hook instance at mount,
   *  incremented once per `reload()` call, never reset — a re-arm after a
   *  failure is just another increment, and unmount discards it with the
   *  component. Nothing outside this hook can read or write it. */
  const generation = useRef(0);

  const reload = useCallback((): Promise<void> => {
    const mine = ++generation.current;
    return fetchLink().then((result) => {
      // Checked once the WHOLE read has settled — `fetchLink` awaits the
      // body as well as the headers, and a foreground burst can start a
      // newer read inside either window. A superseded read applies nothing.
      if (mine !== generation.current) return;
      if ("failed" in result) {
        setFailed(result.failed);
        return;
      }
      setLink(result.link);
      setFailed(null);
    });
  }, []);

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
