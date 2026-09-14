import { appleClientSecret, type ProviderConfig } from "./providers.js";

export interface AppleGrant {
  clientId: string;
  refreshToken: string;
}
/** Resolves true only when EVERY grant was accepted by Apple. */
export type RevokeApple = (grants: AppleGrant[]) => Promise<boolean>;

export function createAppleRevoke(
  config: ProviderConfig,
  fetcher: typeof fetch = fetch,
): RevokeApple {
  return async (grants) => {
    if (!grants.length) return true;
    const results = await Promise.allSettled(
      grants.map(async (g) => {
        const secret = await appleClientSecret(config, g.clientId);
        const response = await fetcher(
          "https://appleid.apple.com/auth/revoke",
          {
            method: "POST",
            body: new URLSearchParams({
              token: g.refreshToken,
              token_type_hint: "refresh_token",
              client_id: g.clientId,
              client_secret: secret,
            }),
            // Bounded on purpose. The rower is waiting on an unlink that has
            // ALREADY committed; this call can only add latency, never change
            // the outcome, so it gets a short leash.
            signal: AbortSignal.timeout(3000),
            redirect: "error",
          },
        );
        // Apple's 200 covers "revoked successfully OR was previously invalid",
        // so a repeat is harmless and needs no dedupe.
        if (!response.ok) throw new Error(String(response.status));
      }),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed)
      console.warn(
        JSON.stringify({
          event: "apple_revoke_failed",
          failed,
          of: grants.length,
        }),
      );
    return failed === 0;
  };
}
