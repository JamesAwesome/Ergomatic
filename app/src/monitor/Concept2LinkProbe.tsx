import { useState } from "react";
import { openExternalUrl } from "../adapters/externalBrowser";
import { useForegroundRefetch } from "../api/useForegroundRefetch";

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
 * `useForegroundRefetch` is mounted BEFORE any tap can fire `openExternalUrl`
 * below — React wires this hook's subscriptions at mount, and the button
 * that calls `openExternalUrl` cannot be tapped before the screen has
 * mounted — satisfying `onNativeBrowserFinished`'s own "register before
 * opening" contract for free, the same way any real screen using this hook
 * would.
 */
export default function Concept2LinkProbe() {
  const [returns, setReturns] = useState(0);
  useForegroundRefetch(() => setReturns((n) => n + 1));

  return (
    <section
      className="c2-link-probe"
      data-c2-link-probe="C2 link probe (dev harness)"
    >
      <h2 className="section-heading">C2 LINK PROBE (DEV HARNESS)</h2>
      <button
        type="button"
        className="button-outline"
        onClick={() => void openExternalUrl(PROBE_URL)}
      >
        Open consent browser
      </button>
      <p>{`Returns detected: ${returns}`}</p>
    </section>
  );
}
