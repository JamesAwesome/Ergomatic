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
 * SFSafariViewController." — the app hands off to that surface and gets no
 * further signal until the rower returns; PR1.5's foreground re-fetch seam
 * (`useForegroundRefetch.ts`) is what notices the return.
 */
export async function openNativeExternalUrl(url: string): Promise<void> {
  await Browser.open({ url });
}
/* v8 ignore stop */
