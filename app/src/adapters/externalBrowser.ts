// Wave E PR1.5 (design spec §Architecture 2-3, Branch A): the native half
// of the Concept2 link hop opens the authorize URL in the system browser.
// Same native-first idiom as `appLifecycle.ts`/`keepAwake.ts`: `isNative()`
// picks the arm, and the native arm reaches its Capacitor plugin only
// through a dynamic `import()` inside that branch, so `@capacitor/browser`
// never lands in the web bundle (`pnpm dist:grep` proves this — see
// externalBrowser test / dist-grep evidence in the task report).
//
// WEB ARM: plain navigation (spec: "plain navigation on web" — the
// callback page's own "return to the app" is the browser Back/close on
// web, no round trip through this module).
//
// NATIVE ARM, PRIMARY (https://capacitorjs.com/docs/apis/browser):
// "On iOS, this uses SFSafariViewController." — quoted verbatim in
// `src/native/externalBrowser.ts`'s own doc comment.

import { isNative } from "../platform";
import { navigateWeb } from "./webNavigate";

/**
 * Opens `url` for the rower to complete the Concept2 OAuth consent screen.
 * Web: synchronous plain navigation. Native: async — resolves once
 * `Browser.open` has handed off to `SFSafariViewController`; the app has no
 * further say over that surface until the rower returns (PR1.5's
 * foreground re-fetch seam, `useForegroundRefetch.ts`, is what notices).
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
