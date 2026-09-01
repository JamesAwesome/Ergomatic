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
 * **Fix round 3 (RF26 correction of an over-promoted claim):** this
 * comment used to say `onNativeBrowserFinished`'s "register before
 * opening" contract was satisfied "for free" because the hook mounts
 * before any tap can fire `openExternalUrl`. That was true only for the
 * FIRST tap: `useReturnToApp` (then `useForegroundRefetch`) depended on
 * `[cb]`, and this card passed a fresh inline arrow on every render, so
 * incrementing `returns` after tap 1 re-rendered the card, tore the
 * subscription down, and re-added it — reopening the exact race for tap
 * 2 onward (antagonist finding 1, fix round 3). `useReturnToApp` now
 * holds `cb` in a ref with an EMPTY effect dependency array (one
 * subscription for the component's whole mounted lifetime), fixing that
 * RE-subscription race for tap 2 onward.
 *
 * **Round 4 correction, the same over-promotion one layer down: tap 1
 * itself is still NOT guaranteed race-free.** Mounting happens before any
 * tap is POSSIBLE, but the subscription this mount triggers is
 * ASYNCHRONOUS — a dynamic `import()` plus `Browser.addListener`'s own
 * returned `Promise` (`onNativeBrowserFinished`) — so an impatient tap on
 * "Open consent browser" the instant the screen appears can still open
 * and finish the browser before that promise chain resolves, missing
 * `browserFinished` for THAT one round trip. Only from tap 2 onward is
 * registration guaranteed complete (once established, fix round 3's fix
 * means it never tears down again) — "for every tap" was still one tap
 * too many.
 */
export default function Concept2LinkProbe() {
  const [returns, setReturns] = useState(0);
  useReturnToApp(() => setReturns((n) => n + 1));

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
