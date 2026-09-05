// Wave E PR1.5, narrowed at PR1.75b and again at PR2's walk fallout (PR B):
// opens an external URL for the rower. Two exports, one per intent, and
// NEITHER branches on platform any more.
//
// `openExternalUrl` serves the OAuth consent hop, and `adapters/linkFlow.ts`'s
// WEB arm is its only consumer (a full-page navigation to Concept2's consent
// screen, whose outcome is read from `GET /api/concept2/link` on the next
// mount). The native link never reached it: `linkFlow.ts` completes that leg
// through `ASWebAuthenticationSession` (PR1.75b), so this function's native
// arm was dead code from that PR onward and is gone.
//
// `openReadOnlyUrl` serves the read-only link-outs the rower comes BACK from
// — `log/Concept2SendBlock.tsx`'s "View on Concept2 →" and "OPEN CONCEPT2
// PROFILE". It used to take `@capacitor/browser`'s `Browser.open` on native,
// which is `SFSafariViewController` — a sheet with its OWN cookie jar. James
// walked it on 2026-09-03 and the sheet, signed out, rendered Concept2's
// "The user has made this result private" page instead of the row he had
// just sent. **Both arms are now the same arm:** `window.open(url, "_blank",
// "noopener,noreferrer")`, which inside the Capacitor WebView is handed to
// the system by `@capacitor/ios`'s own `WebViewDelegationHandler` and opens
// in the phone's default browser, where the rower's Concept2 session lives.
// James's ruling, 2026-09-04: "opening in safari is fine because it will be
// clear you're changing apps."
//
// **This file has NO platform conditional and must not regrow one.** The
// only evidence that the WebView hands the URL to the system is a device
// walk — `isNative()` is false under Vitest and Playwright, so no gate in
// this repo can observe it. See
// `docs/monitor/sessions/walk-2026-09-04-c2-linkout/`.

import { navigateWeb, openWebInNewTab } from "./webNavigate";

/**
 * Opens `url` for the rower to complete the Concept2 OAuth consent screen.
 * Plain navigation: this document leaves for Concept2 and the outcome is
 * read back from `GET /api/concept2/link` on the next mount. Its only
 * consumer is `adapters/linkFlow.ts`'s WEB arm.
 */
export function openExternalUrl(url: string): void {
  navigateWeb(url);
}

/**
 * Opens `url` for a READ-ONLY look the rower comes back from — PR2's
 * "View on Concept2" link-out. Distinct from `openExternalUrl` above:
 * that one navigates THIS document (correct for the OAuth hop, where the
 * app is meant to leave) and would throw the rower out of the app with the
 * log row lost; this one opens a new context and leaves Ergomatic mounted
 * behind it.
 */
export function openReadOnlyUrl(url: string): void {
  openWebInNewTab(url);
}
