/* v8 ignore start -- thin plugin wrapper; proven on device, same
 * coverage-exemption reasoning as this directory's other files
 * (`keepAwake.ts`, `appLifecycle.ts`, `appSettings.ts`, `session.ts`,
 * `signin.ts`). */
import { Browser } from "@capacitor/browser";

/**
 * Opens `url` in the system browser. Wave E PR1.75b: this is now a
 * read-only link-out arm only — the Concept2 OAuth consent screen no
 * longer goes through here on native (see `adapters/linkFlow.ts`, which
 * completes the native link through `ASWebAuthenticationSession` instead).
 *
 * PRIMARY (`@capacitor/browser`'s own docs,
 * https://capacitorjs.com/docs/apis/browser): "On iOS, this uses
 * SFSafariViewController." — presented MODALLY inside the app.
 *
 * **This module's modal-return subscriber was REMOVED at PR1.75b** (design
 * §4): it existed to notice the modal-dismiss return from the OAuth
 * consent screen, a return path this module no longer serves. Its adapter
 * half, and the naming, are recorded once in
 * `adapters/externalBrowser.ts`'s header rather than repeated here -- the
 * PR's own token sweep allows that arm's names on exactly the lines that
 * record its retirement, and this file is not one of them.
 */
export async function openNativeExternalUrl(url: string): Promise<void> {
  await Browser.open({ url });
}
/* v8 ignore stop */
