// Wave E PR1.5, narrowed at PR1.75b: opens an external URL for the rower.
// `adapters/linkFlow.ts`'s WEB arm is the consumer today (a full-page
// navigation to Concept2's consent screen, whose outcome is read from
// `GET /api/concept2/link` on the next mount); PR2's read-only "View on
// Concept2" link-out is the next one, and it is why `@capacitor/browser`
// stays a dependency.
//
// **`onBrowserFinished`/`onNativeBrowserFinished` were REMOVED at PR1.75b**
// (2026-09-02-concept2-pr175-app-bind-design.md §4): with the native link on
// `ASWebAuthenticationSession`, the callback arrives in a promise and the OS
// dismisses the browser itself, so the modal-dismiss signal had no consumer
// left. `api/useReturnToApp.ts` went with it. Two mechanisms for one return
// must not survive on one surface.
//
// Same native-first idiom as `appLifecycle.ts`/`keepAwake.ts`: `isNative()`
// picks the arm, and the native arm reaches its Capacitor plugin only through
// a dynamic `import()` inside that branch. **Narrowed claim, PR1.5 fix round 2
// (P2ii): `@capacitor/browser` being absent from a flag-off `dist/client` is
// because that build has no reachable consumer of the native branch, not
// because the dynamic import folds it out by itself.** The runtime-guarded
// `import()` below emits its own lazy CHUNK that IS present in `dist/client`
// whenever a consumer is compiled in; it is simply never LOADED by a web
// session, since `isNative()` is `false` there (RF12: `pnpm dist:grep`'s
// needles prove the absence of unreachable dev-only code; a legitimately
// SHIPPED, merely-unloaded chunk is a different claim and is not what that
// gate checks).
//
// WEB ARM: plain navigation. NATIVE ARM, PRIMARY
// (https://capacitorjs.com/docs/apis/browser): "On iOS, this uses
// SFSafariViewController." -- quoted verbatim in
// `src/native/externalBrowser.ts`'s own doc comment.

import { isNative } from "../platform";
import { navigateWeb } from "./webNavigate";

/**
 * Opens `url` for the rower to complete the Concept2 OAuth consent screen.
 * Web: synchronous plain navigation. Native: async — resolves once
 * `Browser.open` has handed off to `SFSafariViewController`; the app has no
 * further say over that surface until the rower returns. On native this is
 * used only for read-only link-outs; the Concept2 link itself does not go
 * through here (see `adapters/linkFlow.ts`).
 *
 * `isNative()` is always `false` under Vitest/Playwright (no Capacitor
 * native runtime in a browser context — `adapters/appLifecycle.ts`'s own
 * comment states the same fact for its platform branch), so the native arm
 * below is reached only on a real device; `src/native/externalBrowser.ts`
 * carries the coverage exemption every other `src/native/**` file already
 * has (`vitest.config.ts`).
 */
export function openExternalUrl(url: string): void | Promise<void> {
  if (isNative()) {
    return import("../native/externalBrowser").then(
      ({ openNativeExternalUrl }) => openNativeExternalUrl(url),
    );
  }
  navigateWeb(url);
}
