import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  registerAppLifecycleListener,
  registerWebAppLifecycleListener,
  type AppLifecycleEvent,
} from "../adapters/appLifecycle";
import { onBrowserFinished } from "../adapters/externalBrowser";

// Wave E PR1.5 (design spec §Architecture 2-3, Branch A; plan correction
// 2). RENAMED from `useForegroundRefetch`, fix round 3 (antagonist finding
// 2): the old name promised only "foreground transitions", but this hook
// fires on TWO independent signals (`resume` AND `browserFinished`, fix
// round 2 P1a) — `useReturnToApp` states the real contract: "the rower
// came back to the app", by whichever route.
//
// **CONTRACT IS AT-LEAST-ONCE, NEVER EXACTLY-ONCE.** One physical return
// can fire `cb` twice: a rower who backgrounds mid-consent (real `resume`)
// AND THEN dismisses the browser (`browserFinished`) triggers both
// signals for the SAME return. The named PR2 consumer
// (`GET /api/concept2/link`) is idempotent, so a harmless double re-fetch
// is the only cost today. **Any FUTURE consumer of this hook that is NOT
// idempotent (a POST, a mutation, anything with a side effect that
// compounds) inherits this at-least-once contract and must de-duplicate
// itself** — this hook will not do it for you.
//
// **`browserFinished` is PLUGIN-GLOBAL, not per-`Browser.open()` call.**
// The Capacitor Browser plugin's `addListener("browserFinished", ...)`
// fires for ANY browser this plugin closes anywhere in the app, with no
// correlation token tying a given `open()` call to "its own" close event
// (`@capacitor/browser@8.0.4`'s own `dist/esm/definitions.d.ts` declares
// the listener with a bare `() => void`, no payload identifying which
// browser). A future second, unrelated `Browser.open()` call elsewhere in
// the app while this hook is mounted would ALSO fire `cb` here — another
// instance of the same at-least-once contract above, not a new mechanism.
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
//   already performs). `resume` alone MISSES the common case: `Browser.
//   open` presents `SFSafariViewController` MODALLY inside the app, and
//   the rower dismissing it (Done, swipe-down, a completed consent) never
//   backgrounds/foregrounds the host app, so `pause`/`resume` never fires
//   for THAT return path — only a rower who ALSO backgrounds mid-consent
//   produces a real `resume`. So on native this hook subscribes to BOTH
//   `resume` AND `onBrowserFinished` (`adapters/externalBrowser.ts` — the
//   Browser plugin's own dedicated "closed by the user" event, PRIMARY
//   citation on `src/native/externalBrowser.ts`'s
//   `onNativeBrowserFinished`).
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
//   event), so it is never subscribed on this branch.
//
// **SUBSCRIPTION LIFETIME, fix round 3 (antagonist finding 1 — the
// headline break):** this used to depend on `[cb]`, so a caller passing a
// fresh inline arrow (the probe card did) tore the subscription down and
// re-added it on EVERY RENDER. A `browserFinished`/`resume` event landing
// in that async re-subscribe window was silently dropped — no test could
// see it (every test used a stable `vi.fn()`), and it is exactly the
// class of miss P1a exists to close. Fixed BY CONSTRUCTION: `cb` is held
// in a ref, read fresh on every invocation, and the subscribing effect's
// dependency array is EMPTY — one subscription for the component's whole
// mounted lifetime, never torn down by a `cb` identity change.
//
// **`status`, fix round 7 (P1, finding 5 — replaces fix round 5's plain
// `ready: boolean`, which had no failure state at all):** `"arming"` until
// BOTH `registerAppLifecycleListener` and `onBrowserFinished` have
// settled, `"ready"` once both have SUCCEEDED, `"failed"` if EITHER
// rejects. Fix round 5 attached only fulfillment handlers to both
// Promises — a rejected dynamic `import()` (the module fails to load) or
// a rejected `addListener` call was an UNHANDLED REJECTION, left whichever
// arm DID succeed subscribed with nothing to ever clean it up on a normal
// path, and pinned any caller gating on `ready` at "not ready" FOREVER
// (a boolean has no way to represent "this will never become true").
// `status` fixes this: a rejection on EITHER arm moves straight to
// `"failed"`, unsubscribes whichever arm already succeeded (checking
// BOTH orders — the surviving arm may resolve before or after the
// rejecting one), and every `.then(onFulfilled, onRejected)` call attaches
// its rejection handler in the SAME call, so neither Promise is ever
// unhandled even for one microtask.
export type ReturnToAppStatus = "arming" | "ready" | "failed";

export function useReturnToApp(cb: () => void): { status: ReturnToAppStatus } {
  // Kept current via `useLayoutEffect` (no deps — runs after EVERY
  // render), never written during render itself: `eslint-plugin-
  // react-hooks@7`'s `react-hooks/refs` rule rejects a ref write in the
  // render body outright ("Cannot access refs during render"), so the
  // classic "assign directly in the function body" version of this
  // "always latest callback" pattern is not available in this repo's
  // lint config. `useLayoutEffect` still updates the ref BEFORE the
  // browser paints and before any other effect can observe a stale
  // value, which is what this pattern needs.
  const cbRef = useRef(cb);
  useLayoutEffect(() => {
    cbRef.current = cb;
  });

  const [status, setStatus] = useState<ReturnToAppStatus>("arming");

  useEffect(() => {
    let cancelled = false;
    let failed = false;
    let nativeUnsubscribe: (() => void) | undefined;
    let webUnsubscribe: (() => void) | undefined;
    let browserFinishedUnsubscribe: (() => void) | undefined;
    let lifecycleSettled = false;
    let browserFinishedSettled = false;

    function markReadyIfBothSettled(): void {
      if (!cancelled && !failed && lifecycleSettled && browserFinishedSettled) {
        setStatus("ready");
      }
    }

    // Moves to "failed" on EITHER arm's rejection. Cleans up whichever arm
    // already succeeded and got assigned — checking BOTH unsubscribe
    // variables, since either arm can be the one that rejects and either
    // can be the one that already settled successfully first.
    function fail(): void {
      if (cancelled || failed) return;
      failed = true;
      nativeUnsubscribe?.();
      webUnsubscribe?.();
      browserFinishedUnsubscribe?.();
      setStatus("failed");
    }

    function trackAsyncUnsubscribe(
      promise: Promise<() => void>,
      assign: (unsubscribe: () => void) => void,
      onSettled: () => void,
    ): void {
      // Both handlers attached in the SAME `.then()` call — never a
      // separate `.catch()` chained afterward, which would leave a real
      // (if brief) window where the rejection has no handler yet.
      void promise.then(
        (unsubscribe) => {
          if (cancelled || failed) {
            // Either already torn down (unmount) or the OTHER arm already
            // failed — this arm succeeded too late to matter either way,
            // so it gets cleaned up immediately rather than left dangling.
            unsubscribe();
          } else {
            assign(unsubscribe);
          }
          onSettled();
        },
        () => {
          fail();
        },
      );
    }

    function onEvent(event: AppLifecycleEvent): void {
      if (event === "foreground") cbRef.current();
    }

    const result = registerAppLifecycleListener(onEvent);
    if (result instanceof Promise) {
      trackAsyncUnsubscribe(
        result,
        (unsubscribe) => {
          nativeUnsubscribe = unsubscribe;
        },
        () => {
          lifecycleSettled = true;
          markReadyIfBothSettled();
        },
      );

      // The modal-dismiss signal `resume` alone cannot see (this file's
      // own header). Only reached when the lifecycle listener's own
      // result says "native" above — never on web, where
      // `onBrowserFinished`'s own arm is a no-op anyway (belt and braces,
      // not load-bearing).
      const browserResult = onBrowserFinished(() => cbRef.current());
      if (browserResult instanceof Promise) {
        trackAsyncUnsubscribe(
          browserResult,
          (unsubscribe) => {
            browserFinishedUnsubscribe = unsubscribe;
          },
          () => {
            browserFinishedSettled = true;
            markReadyIfBothSettled();
          },
        );
      } else {
        // Defensive only — real code never reaches this branch here (both
        // calls read the SAME `isNative()`, so if one says native the
        // other does too); kept so a test mocking them independently
        // still marks readiness correctly rather than hanging forever.
        browserFinishedSettled = true;
        markReadyIfBothSettled();
      }
    } else {
      // `result` (the web arm's own no-op unsubscribe) is intentionally
      // discarded — nothing to clean up on that branch. The real listener
      // on this platform is the one below. Both calls are synchronous on
      // web, so readiness is immediate — no real wait, same code path.
      // Neither can reject (both are plain synchronous calls, not
      // Promises), so "failed" is unreachable on web by construction.
      webUnsubscribe = registerWebAppLifecycleListener(onEvent);
      lifecycleSettled = true;
      browserFinishedSettled = true;
      markReadyIfBothSettled();
    }

    return () => {
      cancelled = true;
      nativeUnsubscribe?.();
      webUnsubscribe?.();
      browserFinishedUnsubscribe?.();
    };
    // Deliberately empty: `cbRef` above is what keeps this current without
    // ever re-subscribing (fix round 3, finding 1). No eslint-disable
    // needed — `cbRef` is a ref (exhaustive-deps already excludes stable
    // ref objects) and nothing else in this effect's closure changes.
  }, []);

  return { status };
}
