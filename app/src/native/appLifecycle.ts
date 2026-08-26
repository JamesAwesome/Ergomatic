/* v8 ignore start -- thin plugin wrapper; proven on device via TestFlight,
 * same coverage-exemption reasoning as this directory's other files
 * (`keepAwake.ts`, `appSettings.ts`, `session.ts`, `signin.ts`). The one
 * thing a desk test CAN settle here — WHICH plugin events this binds — is
 * pinned by `appLifecycle.test.ts` next door, which mocks `@capacitor/app`
 * itself; see that file's header for why that test exists. */
import { App } from "@capacitor/app";
import type {
  AppLifecycleCallback,
  AppLifecycleUnsubscribe,
} from "../adapters/appLifecycle";

/**
 * Binds `pause`/`resume`, the plugin's REAL background transitions.
 *
 * PRIMARY (`@capacitor/app@8.1.1`'s own `dist/esm/definitions.d.ts`, the
 * type definitions shipped with the package):
 *   - `pause` (:223) — "On iOS it's fired when the native
 *     `UIApplication.didEnterBackgroundNotification` event gets fired."
 *   - `resume` (:234) — "On iOS it's fired when the native
 *     `UIApplication.willEnterForegroundNotification` event gets fired."
 *
 * **This used to bind `appStateChange` (:213), and that was the bug.** That
 * event is fired from "`UIApplication.willResignActiveNotification` and
 * `UIApplication.didBecomeActiveNotification`" — ACTIVE/INACTIVE, iOS's
 * transient-interruption signal, which a Control Centre swipe or a
 * notification peek raises without the app ever leaving the foreground. The
 * 2026-08-26 walk (`docs/monitor/sessions/walk-2026-08-26/`) recorded nine
 * of them in 288 s with 233 frames arriving across the nine supposed gaps.
 *
 * **The swap alone is NOT the fix** (design spec's own rejected option): a
 * genuine 800 ms backgrounding is a real `resume` over a stream that never
 * stopped. `useMonitorSession.ts`'s resume handler is what MEASURES the gap
 * before deciding anything — this module only reports the transition, the
 * same division of labour `adapters/appLifecycle.ts`'s header already
 * states.
 */
export async function registerNativeAppLifecycleListener(
  cb: AppLifecycleCallback,
): Promise<AppLifecycleUnsubscribe> {
  const pause = await App.addListener("pause", () => {
    cb("background");
  });
  const resume = await App.addListener("resume", () => {
    cb("foreground");
  });
  return () => {
    void pause.remove();
    void resume.remove();
  };
}
/* v8 ignore stop */
