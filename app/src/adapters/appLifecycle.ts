// Phase LL Task 2 (link-truth design spec §2, mechanism 2): "the monitor
// stack registers no app-lifecycle listener anywhere". This is the seam
// that fixes it — the ONE place the background/foreground platform
// conditional lives, per the native-first policy (CLAUDE.md,
// `keepAwake.ts`/`auth.tsx`'s own established idiom: `isNative()` picks the
// arm, the native arm reaches its Capacitor plugin only through a dynamic
// `import()` inside that branch, so `@capacitor/app` never lands in the web
// bundle).
//
// WEB ARM, PRIMARY: the Page Visibility API
// (https://www.w3.org/TR/page-visibility-2/, PRIMARY — the spec that
// actually owns "the OS/browser decided this tab is not what the user is
// looking at"). `visibilitychange`/`document.visibilityState` is the
// standard signal; it is what `keepAwake.ts`'s own `onVisibilityChange`
// already keys on for the identical "the tab went away and came back"
// question, one file over. This module reuses the same primitive rather
// than inventing a second one.
//
// NATIVE ARM: `@capacitor/app`'s `addListener("appStateChange", ...)`
// (https://capacitorjs.com/docs/apis/app#addlistenerappstatechange- —
// PRIMARY, the official Capacitor App API) — `isActive` is the plugin's own
// boolean for "the app is in the foreground", which this module translates
// into the same two-value vocabulary the web arm already speaks rather than
// exposing the plugin's own shape upward.
//
// WHAT THIS DOES NOT CLAIM: whether a backlog of missed BLE notifications
// drains the instant the app resumes is UNKNOWN (design spec §2: "Whether a
// backlog drains on resume is walk item W6 — design for both outcomes,
// promise neither"). This module only reports the transition; it is
// `useMonitorSession.ts`'s job (mechanism 2's own consumer) to treat
// whatever arrives after a resume as suspect until proven healthy, never
// this file's.

import { isNative } from "../platform";

export type AppLifecycleEvent = "background" | "foreground";
export type AppLifecycleCallback = (event: AppLifecycleEvent) => void;
export type AppLifecycleUnsubscribe = () => void;

/** Web arm: `document.visibilityState` is `"hidden"`/`"visible"` — mapped
 *  onto this module's own `"background"`/`"foreground"` vocabulary rather
 *  than leaking the DOM API's own string literals upward, the same
 *  translation `keepAwake.ts`'s own web arm already performs for the
 *  identical event. Exported (not `default`) so a test can call it
 *  directly against a real `document` in jsdom, the same shape this
 *  repo's other adapter tests already use for their web arms. */
export function registerWebAppLifecycleListener(
  cb: AppLifecycleCallback,
): AppLifecycleUnsubscribe {
  function onVisibilityChange(): void {
    cb(document.visibilityState === "visible" ? "foreground" : "background");
  }
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

/**
 * Registers `cb` for background/foreground transitions on whichever
 * platform is live. Returns the unsubscribe synchronously on web; on
 * native it returns a `Promise` (the plugin's own `addListener` is async —
 * same shape `defaultTransport`'s own native arm already returns a
 * `Promise` for the identical "the native call is async, the web one
 * isn't" reason).
 *
 * `isNative()` is always `false` under Vitest/Playwright (no Capacitor
 * native runtime in a browser context — `adapters/monitorTransport.ts`'s
 * own comment states the same fact for its platform branch), so the native
 * arm below is reached only on a real device; `src/native/appLifecycle.ts`
 * carries the coverage exemption every other `src/native/**` file already
 * has (`vitest.config.ts`).
 */
export function registerAppLifecycleListener(
  cb: AppLifecycleCallback,
): AppLifecycleUnsubscribe | Promise<AppLifecycleUnsubscribe> {
  if (isNative()) {
    return import("../native/appLifecycle").then(
      ({ registerNativeAppLifecycleListener }) =>
        registerNativeAppLifecycleListener(cb),
    );
  }
  return registerWebAppLifecycleListener(cb);
}
