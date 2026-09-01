import { useEffect } from "react";
import {
  registerAppLifecycleListener,
  registerWebAppLifecycleListener,
  type AppLifecycleEvent,
} from "../adapters/appLifecycle";

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
//   already performs) — that IS the foreground signal, and this hook rides
//   it as-is.
// - Web: `registerAppLifecycleListener`'s web arm is a genuine no-op
//   (Phase LL Minor 9, scoped to the monitor's suspect-marking use case —
//   `appLifecycle.ts`'s own header) and never calls back on either
//   transition, so the `Promise` branch below is never taken. This hook
//   instead rides `registerWebAppLifecycleListener` directly, the raw Page
//   Visibility mapping (plan correction 2) — a link-status re-fetch on
//   tab-return is exactly the use case that primitive is for, and it never
//   interferes with Minor 9's native-only monitor scoping because that
//   scoping lives entirely inside `registerAppLifecycleListener`'s own web
//   no-op branch, untouched by this composition.
export function useForegroundRefetch(cb: () => void): void {
  useEffect(() => {
    let cancelled = false;
    let nativeUnsubscribe: (() => void) | undefined;
    let webUnsubscribe: (() => void) | undefined;

    function onEvent(event: AppLifecycleEvent): void {
      if (event === "foreground") cb();
    }

    const result = registerAppLifecycleListener(onEvent);
    if (result instanceof Promise) {
      void result.then((unsubscribe) => {
        if (cancelled) {
          unsubscribe();
        } else {
          nativeUnsubscribe = unsubscribe;
        }
      });
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
    };
  }, [cb]);
}
