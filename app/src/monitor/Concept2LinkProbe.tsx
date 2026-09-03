import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { startLink, type LinkOutcome } from "../adapters/linkFlow";

/**
 * Wave E PR1.75b: a dev-only card that runs a REAL Concept2 link against
 * `log-dev.concept2.com`, on device, through the same `adapters/linkFlow.ts`
 * PR2's card will use.
 *
 * **This is a real link now.** Its PR1.5 ancestor was the opposite -- it
 * opened `https://log-dev.concept2.com` in `SFSafariViewController` purely to
 * watch a return signal fire, posted nothing, and carried no client id or
 * state. That card and the `useReturnToApp` hook it exercised are both gone
 * (design §4's retirement): with `ASWebAuthenticationSession` the callback
 * arrives in a promise, so there is no return signal left to instrument.
 * A tap here mints an attempt, opens Concept2's consent screen in an
 * ephemeral session, and posts `POST /api/concept2/exchange`. On a walk build
 * pointed at a dev server with `C2_LINK_ENABLED=1`, completing it writes a
 * real `concept2_links` row.
 *
 * WHY IT EXISTS: nothing in this repo's own gates can reach the Swift plugin.
 * There is no XCTest target, `src/native/**` is coverage-exempt
 * (`vitest.config.ts:48`), and `pnpm e2e` runs on web where `isNative()` is
 * always false (RF19). This card plus the walk
 * (`docs/superpowers/plans/2026-09-02-concept2-pr175b-walk.md`) is the whole
 * instrument.
 *
 * READING THE TWO LINES TOGETHER. `Last outcome: cancelled` beside
 * `Link status: linked` is NOT a cancellation: it means the mint
 * authenticated by COOKIE, so the server derived `surface: "web"` and issued
 * the WEB `redirect_uri` (`routes/concept2.ts:67` vs the native constant).
 * Concept2 then redirected to our https callback INSIDE the sheet, which
 * completed the link server-side, and the rower dismissed a page the session
 * was never going to hand back -- hence `cancelled`. Record it if it appears;
 * it is direct evidence about the design's UNMEASURED "can a native request
 * carry a cookie" premise (design §1). On the walk this card was built for,
 * the web-callback path above cannot actually complete: the tunnel's
 * `https://<TUNNEL>/api/concept2/callback` is never registered at Concept2,
 * so an in-sheet web redirect would show D3's error page rather than
 * finishing. The server's `auth_via` log lines are the authority on what
 * actually happened if this pairing appears.
 *
 * `Link status` also distinguishes a FLAG-OFF server from an unlinked
 * account: `GET /api/concept2/link` answers `{available:false}` with HTTP 200
 * (`routes/concept2.ts:518-523`), so `describeStatus` names that case
 * explicitly rather than letting it read as "not linked". It names a THIRD
 * case for the same reason: when the read itself throws, the line says
 * `unreadable`, because a walk over a quick tunnel drops requests and a stale
 * status line is how an operator records a server state nobody observed.
 *
 * Build-time flag gated (`VITE_ENABLE_C2_LINK_PROBE`), same shape as
 * `AppRoutes.tsx`'s `VITE_ENABLE_FAKE_MONITOR` seam: mounted behind a dynamic
 * `import()` guarded by a build-time-folded condition (`You.tsx:19-23`), so
 * this card and its distinctive `data-c2-link-probe` literal are ABSENT from a
 * production build with the flag unset -- `dist-grep.sh:127`'s eighth needle
 * is that exact string, and `ios-release.sh:42-45` refuses to run at all while
 * the flag is exported.
 */
interface LinkStatus {
  available: boolean;
  linked?: boolean;
  weightClass?: "H" | "L";
  c2UserId?: number;
  needsReauth?: boolean;
}

/** `n/a` for the outcomes that never parsed a callback at all (a plugin
 *  rejection, a refused mint, the web arm's navigation hand-off). Whether
 *  Concept2 echoes `state` on a private-use-scheme redirect is UNMEASURED and
 *  nothing depends on it -- this readout is how the walk measures it.
 *
 *  `stateMismatch` is the one parsed-callback outcome carrying no `stateEchoed`
 *  field, and it still answers `yes`: that member is only reachable when a
 *  state WAS echoed (an absent one cannot mismatch), so the flag would be a
 *  constant `true` on the TYPE and is a fact about the member here. Reading
 *  `n/a` for it would tell the walk "no callback was parsed" about the one
 *  outcome that proves a callback was parsed AND carried a state. */
function stateEchoLabel(outcome: LinkOutcome | null): string {
  if (outcome === null) return "n/a";
  if (outcome.kind === "stateMismatch") return "yes";
  return "stateEchoed" in outcome
    ? outcome.stateEchoed
      ? "yes"
      : "no"
    : "n/a";
}

/**
 * The payload beside the kind. `Last outcome: pluginError` on its own is the
 * walk's worst line: a plugin rejection is raised inside the Swift, BEFORE any
 * request leaves the phone, so its `code`/`message` reach no server log, no
 * `auth_via` line and no network capture -- this readout is their only channel.
 * The same reasoning gives the server-hop members their status and error text
 * (`serverError` carries a status but no error string, `mintFailed`'s may be
 * `null`; both render as the bare status) and `networkError` its message.
 * Outcomes that are wholly described by their kind add nothing.
 */
function outcomeDetail(o: LinkOutcome): string {
  if ("code" in o) return ` (${o.code}: ${o.message})`;
  // `"error" in o` as well as the null check: `serverError` has a `status` and
  // no `error` FIELD at all, so `o.error` alone does not compile against this
  // union. The two guards together mean the same thing at runtime.
  if ("status" in o)
    return ` (${String(o.status)}${"error" in o && o.error !== null ? `: ${o.error}` : ""})`;
  if ("message" in o) return ` (${o.message})`;
  return "";
}

function describeStatus(
  status: LinkStatus | null,
  statusError: boolean,
): string {
  // Checked BEFORE the null case: a failed read leaves `status` null, and
  // `reading...` on a request that already failed is a line that never
  // resolves and never says why.
  if (statusError) return "unreadable (the request failed)";
  if (status === null) return "reading...";
  // `{available:false}` comes back with HTTP 200 (routes/concept2.ts:518-523),
  // so a flag-off server would otherwise read exactly like an unlinked one.
  if (!status.available) return "not available (C2_LINK_ENABLED is off)";
  if (!status.linked) return "not linked";
  // `needsReauth` is the row's `needs_reauth_at` (routes/concept2.ts:537). A
  // link that needs re-auth is still a link -- the row exists, the account id
  // is real -- so it renders as a qualifier rather than a fourth state; a walk
  // that reads plain `linked` over a stale-token row records the wrong thing.
  const reauth = status.needsReauth === true ? ", needs re-auth" : "";
  return `linked (C2 user ${String(status.c2UserId)}, ${String(status.weightClass)}${reauth})`;
}

export default function Concept2LinkProbe() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  // `.then`/`.catch` rather than `async`/`await`, and NOT stylistic: the mount
  // effect below calls this, and `react-hooks/set-state-in-effect`
  // (`eslint.config.js:35`) rejects an effect that reaches a `setState`
  // synchronously -- which an `async` function's pre-`await` body is. This is
  // the repo's own established mount-fetch idiom (`WorkoutDetail.tsx:52`,
  // `void f().then(cb)`); every `setState` here runs in a callback.
  //
  // Same reason `linkFlow` has a `networkError` member: on a walk over a
  // cloudflared quick tunnel a dropped request is normal, and a silently
  // stale status line is how an operator misreads the whole check. Without
  // this `.catch` the rejection escapes, the card keeps whatever
  // `Link status:` text it already had -- `not linked` from before a link
  // that DID succeed, or `reading...` forever on the mount read -- and the
  // operator records a server state nobody observed.
  const readStatus = useCallback(
    () =>
      api("/api/concept2/link")
        .then((res) => res.json())
        .then((s) => {
          setStatus(s as LinkStatus);
          setStatusError(false);
        })
        .catch(() => {
          setStatusError(true);
        }),
    [],
  );

  useEffect(() => {
    void readStatus();
  }, [readStatus]);

  async function onStart(): Promise<void> {
    setBusy(true);
    try {
      const result = await startLink({ weightClass: "H" });
      setOutcome(result);
      // The card never infers its own status from an outcome: it re-reads the
      // server. An outcome saying `linked` while `GET /link` disagrees is
      // exactly the kind of thing this card exists to show a walk operator.
      await readStatus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="c2-link-probe"
      data-c2-link-probe="C2 link probe (dev harness)"
    >
      <h2 className="section-heading">C2 LINK PROBE (DEV HARNESS)</h2>
      <p>{`Link status: ${describeStatus(status, statusError)}`}</p>
      <button
        type="button"
        className="button-outline"
        disabled={busy}
        onClick={() => void onStart()}
      >
        {busy ? "Linking..." : "Start real link (log-dev)"}
      </button>
      <p>{`Last outcome: ${outcome === null ? "none yet" : `${outcome.kind}${outcomeDetail(outcome)}`}`}</p>
      <p>{`Callback carried state: ${stateEchoLabel(outcome)}`}</p>
      <button
        type="button"
        className="button-outline"
        disabled={busy}
        onClick={() => void readStatus()}
      >
        Re-read link status
      </button>
    </section>
  );
}
