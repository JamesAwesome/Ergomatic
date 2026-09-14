/* v8 ignore start -- thin native plugin wrapper. Its cross-language literals
 * are pinned by scripts/apple-auth-contract.test.ts, which is a SOURCE-TEXT
 * census and not a compile: there is no macOS runner and no `xcodebuild` in
 * .github/workflows, so no CI job compiles or runs any Swift in this repo.
 * `AppleAuthPlugin.swift` is first compiled when someone runs `pnpm ios:build`
 * or `pnpm ios:release` on a Mac. Do not read this exemption as "the iOS gate
 * covers it" — an earlier revision of this comment said exactly that and it
 * was false. */
import { registerPlugin } from "@capacitor/core";

export interface AppleAuthAuthorizeOptions {
  /** Server-minted OpenID nonce. Forwarded to Apple unchanged. */
  nonce: string;
  /** Server-minted authorization state. Forwarded to Apple unchanged. */
  state: string;
}

export interface AppleAuthAuthorizeResult {
  /** Apple's signed identity JWT. It remains transient client state. */
  idToken: string;
  /** Apple's single-use authorization code. It remains transient client state. */
  authorizationCode: string;
  /** The state echoed by Apple, for server-side attempt validation. */
  state: string;
  /** Apple's first-authorization name, omitted when Apple supplies none. */
  name?: string;
}

export interface AppleAuthPlugin {
  authorize(
    options: AppleAuthAuthorizeOptions,
  ): Promise<AppleAuthAuthorizeResult>;
}

export const AppleAuth = registerPlugin<AppleAuthPlugin>("AppleAuth");
/* v8 ignore stop */
