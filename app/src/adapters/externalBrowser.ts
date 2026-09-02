// Wave E PR1.5 (design spec §Architecture 2-3, Branch A): the native half
// of the Concept2 link hop opens the authorize URL in the system browser.
// Same native-first idiom as `appLifecycle.ts`/`keepAwake.ts`: `isNative()`
// picks the arm, and the native arm reaches its Capacitor plugin only
// through a dynamic `import()` inside that branch. **Narrowed claim, fix
// round 2 (P2ii — the original wording overclaimed):** `@capacitor/browser`
// being absent from a flag-off `dist/client` is because the flag-off build
// has no reachable consumer of the native branch, not because the dynamic
// import folds it out by itself. **Corrected 2026-09-01 (fix round 16):**
// this module DOES have a real consumer today —
// `src/monitor/Concept2LinkProbe.tsx` imports `openExternalUrl` directly,
// behind `VITE_ENABLE_C2_LINK_PROBE`/`DEV` — so "nothing in `src/` imports
// this module" is stale; the accurate claim is that the probe's own
// dynamic `import()` still only emits its lazy CHUNK when built WITH the
// flag, and that chunk is never loaded by a web session regardless
// (`isNative()` is `false` there). Once PR2's real card exists, the same
// shape holds. The runtime-guarded `import()` below emits its own lazy
// CHUNK that IS present in `dist/client` whenever a consumer is compiled
// in — it is simply never LOADED by a web session, since `isNative()` is
// `false` there and that branch never executes (RF12: `pnpm dist:grep`'s
// `C2_CLIENT_SECRET`-style needles prove absence of unreachable dev-only
// code; a legitimately SHIPPED, merely-unloaded chunk is a different claim
// and is not what that gate checks).
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
 * further say over that surface until the rower returns. **Fix round 2
 * (P1a):** that return is noticed by `useReturnToApp.ts`'s composed
 * `resume`/`browserFinished` signal, NOT `resume` alone — see
 * `onBrowserFinished` below for why `resume` on its own misses the modal
 * dismiss.
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

/**
 * Native only: fires `cb` when the rower dismisses the modally-presented
 * consent browser (Done/close/swipe-down) — the return path
 * `adapters/appLifecycle.ts`'s `pause`/`resume` translation CANNOT see,
 * because `SFSafariViewController` closes without the host app ever
 * backgrounding (fix round 2, P1a — `src/native/externalBrowser.ts`'s own
 * doc comment on `onNativeBrowserFinished` carries the vendor citation).
 * Web: a genuine no-op (plain navigation has no "closed" event of its own;
 * the callback page's own Back/close is the return path there, spec
 * §Architecture 3) — never called, matching `adapters/appLifecycle.ts`'s
 * `registerAppLifecycleListener` web no-op shape exactly.
 *
 * Same return-shape contract as that function too: synchronous on web (a
 * no-op unsubscribe), a `Promise` on native — so `useReturnToApp.ts`
 * can dispatch on the shape with no `isNative()` of its own, the same way
 * it already does for `registerAppLifecycleListener`.
 */
export function onBrowserFinished(
  cb: () => void,
): (() => void) | Promise<() => void> {
  if (isNative()) {
    return import("../native/externalBrowser").then(
      ({ onNativeBrowserFinished }) => onNativeBrowserFinished(cb),
    );
  }
  return () => undefined;
}
