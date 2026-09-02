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

/** `n/a` for the outcomes that never parsed a callback (a plugin rejection, a
 *  refused mint, the web arm's navigation hand-off). Whether Concept2 echoes
 *  `state` on a private-use-scheme redirect is UNMEASURED and nothing depends
 *  on it -- this readout is how the walk measures it. */
function stateEchoLabel(outcome: LinkOutcome | null): string {
  if (outcome === null) return "n/a";
  return "stateEchoed" in outcome
    ? outcome.stateEchoed
      ? "yes"
      : "no"
    : "n/a";
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
  return `linked (C2 user ${String(status.c2UserId)}, ${String(status.weightClass)})`;
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
      <p>{`Last outcome: ${outcome === null ? "none yet" : outcome.kind}`}</p>
      <p>{`Callback carried state: ${stateEchoLabel(outcome)}`}</p>
      <button
        type="button"
        className="button-outline"
        onClick={() => void readStatus()}
      >
        Re-read link status
      </button>
    </section>
  );
}
