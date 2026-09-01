/* v8 ignore start -- thin plugin wrapper; proven on device, same
 * coverage-exemption reasoning as this directory's other files
 * (`keepAwake.ts`, `appLifecycle.ts`, `appSettings.ts`, `session.ts`,
 * `signin.ts`). */
import { Browser } from "@capacitor/browser";

/**
 * Opens `url` in the system browser for the Concept2 OAuth consent screen.
 *
 * PRIMARY (`@capacitor/browser`'s own docs,
 * https://capacitorjs.com/docs/apis/browser): "On iOS, this uses
 * SFSafariViewController." — presented MODALLY inside the app. Fix round 2
 * (P1a, reviewer finding): dismissing it this way does NOT background or
 * foreground the host app, so `adapters/appLifecycle.ts`'s `pause`/`resume`
 * translation never fires for this return path — `onNativeBrowserFinished`
 * below, not `useForegroundRefetch.ts` alone, is what notices a successful
 * in-modal return.
 */
export async function openNativeExternalUrl(url: string): Promise<void> {
  await Browser.open({ url });
}

/**
 * Binds the Browser plugin's own `browserFinished` event — the dedicated
 * signal for "the rower dismissed the modally-presented
 * `SFSafariViewController`" (Done, swipe-down, or the OAuth redirect
 * landing on our https callback page, which the rower still has to
 * dismiss by hand). **Register this BEFORE calling `Browser.open` at the
 * call site**: a browser that finishes before the listener attaches fires
 * nothing (`addListener` is not retroactive).
 *
 * PRIMARY (`@capacitor/browser@8.0.4`'s own shipped
 * `dist/esm/definitions.d.ts`, `BrowserPlugin.addListener`'s
 * `'browserFinished'` overload doc comment, quoted verbatim): "Android &
 * iOS only: Listen for the browser finished event. It fires when the
 * Browser is closed by the user."
 */
export async function onNativeBrowserFinished(
  cb: () => void,
): Promise<() => void> {
  const handle = await Browser.addListener("browserFinished", cb);
  return () => {
    void handle.remove();
  };
}
/* v8 ignore stop */
