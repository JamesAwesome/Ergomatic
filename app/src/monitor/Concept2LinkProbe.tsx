import { useState } from "react";
import { openExternalUrl } from "../adapters/externalBrowser";
import { useReturnToApp } from "../api/useReturnToApp";

/**
 * A dev-only probe, never a real link: `log-dev.concept2.com` never sees a
 * token from this card — the point is proving the RETURN signal fires on
 * device, not completing an OAuth exchange (this card posts nothing and
 * carries no client id or state).
 */
const PROBE_URL = "https://log-dev.concept2.com";

/**
 * Wave E PR1.5 fix round 2 (P1a-device): a 2-minute on-device check for the
 * modal-return seam our own instruments cannot reach — `src/native/**` is
 * coverage-exempt (RF19), `pnpm e2e` runs on web, and
 * `SFSafariViewController`'s modal dismissal (fix round 2, P1a) only
 * exists on a real device. Build-time flag gated
 * (`VITE_ENABLE_C2_LINK_PROBE`), same shape as `AppRoutes.tsx`'s
 * `VITE_ENABLE_FAKE_MONITOR` seam (`monitorInstrumentEnabled`) — mounted
 * behind a dynamic `import()` guarded by a build-time-folded condition, so
 * this card and its distinctive `data-c2-link-probe` literal are ABSENT
 * from a production build with the flag unset. RF12 red proof and exact
 * operator steps: `docs/superpowers/plans/2026-09-01-concept2-pr15-walk.md`.
 *
 * **History of this comment's own over-promotions, kept rather than
 * deleted (the pattern itself is worth remembering):** fix round 3 fixed
 * the RE-subscription race (a `[cb]`-keyed effect tore down and rebuilt
 * the subscription on every render/tap) but the comment then claimed
 * "for every tap, not just the first" — round 4 caught that tap 1 ITSELF
 * still raced the INITIAL async registration (mount happens before any
 * tap is possible, but the subscription that mount triggers is
 * asynchronous, so an impatient first tap could still open and finish the
 * browser before it settled). **Fix round 5 (P1) closes that gap for
 * real, not just documents it:** `useReturnToApp` now exposes `ready`,
 * `false` until BOTH its subscriptions have settled, and this button is
 * `disabled` (reading "Arming…") until `ready` is `true` — so tap 1 is
 * now ALSO guaranteed race-free, by construction, the same way tap 2
 * onward already was.
 */
export default function Concept2LinkProbe() {
  const [returns, setReturns] = useState(0);
  const { ready } = useReturnToApp(() => setReturns((n) => n + 1));

  return (
    <section
      className="c2-link-probe"
      data-c2-link-probe="C2 link probe (dev harness)"
    >
      <h2 className="section-heading">C2 LINK PROBE (DEV HARNESS)</h2>
      <button
        type="button"
        className="button-outline"
        disabled={!ready}
        onClick={() => void openExternalUrl(PROBE_URL)}
      >
        {ready ? "Open consent browser" : "Arming…"}
      </button>
      <p>{`Returns detected: ${returns}`}</p>
    </section>
  );
}
