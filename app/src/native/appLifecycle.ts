/* v8 ignore start -- thin plugin wrapper; proven on device via TestFlight,
 * same coverage-exemption reasoning as this directory's other files
 * (`keepAwake.ts`, `appSettings.ts`, `session.ts`, `signin.ts`). */
import { App } from "@capacitor/app";
import type {
  AppLifecycleCallback,
  AppLifecycleUnsubscribe,
} from "../adapters/appLifecycle";

export async function registerNativeAppLifecycleListener(
  cb: AppLifecycleCallback,
): Promise<AppLifecycleUnsubscribe> {
  const handle = await App.addListener("appStateChange", ({ isActive }) => {
    cb(isActive ? "foreground" : "background");
  });
  return () => {
    void handle.remove();
  };
}
/* v8 ignore stop */
