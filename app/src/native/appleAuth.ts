/* v8 ignore start -- thin native plugin wrapper; Swift behavior is compiled
 * by the iOS gate and its cross-language literals are pinned by
 * scripts/apple-auth-contract.test.ts. */
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
