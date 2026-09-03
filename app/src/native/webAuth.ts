/* v8 ignore start -- thin plugin wrapper; the real implementation is Swift and
 * is proven on device by the PR1.75b walk
 * (docs/superpowers/plans/2026-09-02-concept2-pr175b-walk.md), the same
 * coverage-exemption reasoning as this directory's other files
 * (`keepAwake.ts`, `appLifecycle.ts`, `externalBrowser.ts`, `signin.ts`). */
import { registerPlugin } from "@capacitor/core";

/** Options for `WebAuth.start`. Mirrors `WebAuthPlugin.startOnMain(_:)`'s
 *  three `call.get*` reads exactly (`app/ios/App/App/WebAuthPlugin.swift`).
 *  `callbackScheme` is the BARE scheme, never with `://` -- the Swift side
 *  rejects `badRequest` if it carries `:` or `/`. */
export interface WebAuthStartOptions {
  url: string;
  callbackScheme: string;
  /** `prefersEphemeralWebBrowserSession`. Always `true` for the Concept2
   *  link: design §4 treats it as a CONTROL against RFC 9700 §4.5 code
   *  injection on a shared phone, not a UX preference. */
  ephemeral: boolean;
}

export interface WebAuthStartResult {
  /** The absolute callback URL, e.g.
   *  `haus.waffle.ergomatic://oauth/callback?code=...&state=...`. */
  callbackUrl: string;
}

/**
 * Rejections carry a `code` on the thrown error (Capacitor turns
 * `call.reject(message, code)` into one). The Swift side's full set:
 * `busy` | `noWindow` | `cancelled` | `noContext` | `contextInvalid` |
 * `abandoned` | `cannotStart` | `badRequest` | `pluginError`.
 * `adapters/linkFlow.ts` is the only reader and maps every one of them; an
 * unrecognised code becomes `pluginError` there rather than being folded into
 * `cancelled`.
 */
export interface WebAuthPlugin {
  start(options: WebAuthStartOptions): Promise<WebAuthStartResult>;
}

export const WebAuth = registerPlugin<WebAuthPlugin>("WebAuth");
/* v8 ignore stop */
