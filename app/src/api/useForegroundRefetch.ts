import { useEffect } from "react";
import {
  registerAppLifecycleListener,
  registerWebAppLifecycleListener,
  type AppLifecycleEvent,
} from "../adapters/appLifecycle";
import { onBrowserFinished } from "../adapters/externalBrowser";

// Wave E PR1.5 (design spec §Architecture 2-3, Branch A; plan correction
// 2): the foreground re-fetch seam PR2's Concept2 card uses to re-fetch
// `GET /api/concept2/link` when the rower returns from the consent
// browser.
//
// This hook contains NO platform conditional of its own — none of its code
// calls `isNative()` (the eslint boundary forbids importing `../platform`
// outside `src/adapters/**`/`src/native/**` in the first place: `src/api/`
// is not on that exempt list). Instead it reacts to
// `registerAppLifecycleListener`'s OWN documented return shape
// (`adapters/appLifecycle.ts`: synchronous on web, a `Promise` on native)
// to tell which arm is live, so the one platform branch stays where the
// native-first policy puts it — inside the adapter, not here.
//
// - Native: `registerAppLifecycleListener` resolves to the real pause/
//   resume-backed unsubscribe (the plugin translation `appLifecycle.ts`
//   already performs). **Fix round 2 (P1a, reviewer finding — this was
//   the wrong return signal on its own):** `resume` alone MISSES the
//   common case. `Browser.open` presents `SFSafariViewController`
//   MODALLY inside the app; the rower dismissing it (Done, swipe-down, a
//   completed consent) never backgrounds/foregrounds the host app, so
//   `pause`/`resume` never fires for that return path — only a rower who
//   ALSO backgrounds mid-consent (Control Centre, app switcher) produces
//   a real `resume`. So on native this hook subscribes to BOTH signals:
//   `registerAppLifecycleListener`'s `resume` translation AND
//   `onBrowserFinished` (`adapters/externalBrowser.ts` — the Browser
//   plugin's own dedicated "closed by the user" event, PRIMARY citation
//   on `src/native/externalBrowser.ts`'s `onNativeBrowserFinished`). A
//   rower who does both (backgrounds, THEN dismisses) fires `cb` twice;
//   the re-fetch it drives (`GET /api/concept2/link`) is idempotent, so a
//   harmless double GET is the only cost and it is not worth suppressing.
// - Web: `registerAppLifecycleListener`'s web arm is a genuine no-op
//   (Phase LL Minor 9, scoped to the monitor's suspect-marking use case —
//   `appLifecycle.ts`'s own header) and never calls back on either
//   transition, so the `Promise` branch below is never taken. This hook
//   instead rides `registerWebAppLifecycleListener` directly, the raw Page
//   Visibility mapping (plan correction 2) — a link-status re-fetch on
//   tab-return is exactly the use case that primitive is for, and it never
//   interferes with Minor 9's native-only monitor scoping because that
//   scoping lives entirely inside `registerAppLifecycleListener`'s own web
//   no-op branch, untouched by this composition. `onBrowserFinished`'s own
//   web arm is a genuine no-op too (plain navigation has no "closed"
//   event), so it is never subscribed on this branch — web is unchanged
//   by this fix round.
export function useForegroundRefetch(cb: () => void): void {
  useEffect(() => {
    let cancelled = false;
    let nativeUnsubscribe: (() => void) | undefined;
    let webUnsubscribe: (() => void) | undefined;
    let browserFinishedUnsubscribe: (() => void) | undefined;

    function trackAsyncUnsubscribe(
      promise: Promise<() => void>,
      assign: (unsubscribe: () => void) => void,
    ): void {
      void promise.then((unsubscribe) => {
        if (cancelled) {
          unsubscribe();
        } else {
          assign(unsubscribe);
        }
      });
    }

    function onEvent(event: AppLifecycleEvent): void {
      if (event === "foreground") cb();
    }

    const result = registerAppLifecycleListener(onEvent);
    if (result instanceof Promise) {
      trackAsyncUnsubscribe(result, (unsubscribe) => {
        nativeUnsubscribe = unsubscribe;
      });

      // The modal-dismiss signal `resume` alone cannot see (this file's
      // own header, fix round 2 P1a). Only reached when the lifecycle
      // listener's own result says "native" above — never on web, where
      // `onBrowserFinished`'s own arm is a no-op anyway (belt and braces,
      // not load-bearing).
      const browserResult = onBrowserFinished(cb);
      if (browserResult instanceof Promise) {
        trackAsyncUnsubscribe(browserResult, (unsubscribe) => {
          browserFinishedUnsubscribe = unsubscribe;
        });
      }
    } else {
      // `result` (the web arm's own no-op unsubscribe) is intentionally
      // discarded — nothing to clean up on that branch. The real listener
      // on this platform is the one below.
      webUnsubscribe = registerWebAppLifecycleListener(onEvent);
    }

    return () => {
      cancelled = true;
      nativeUnsubscribe?.();
      webUnsubscribe?.();
      browserFinishedUnsubscribe?.();
    };
  }, [cb]);
}
