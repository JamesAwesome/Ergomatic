import * as client from "openid-client";

export interface Claims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface OAuthProvider {
  authorizationUrl(): Promise<{ url: string; cookiePayload: string }>;
  callbackClaims(currentUrl: URL, cookiePayload: string): Promise<Claims>;
}

/* v8 ignore start -- discovery is a thin openid-client wrapper; proven by
   the live sign-in, not by a test that would just mock Google. The
   `authorizationUrl` body below is deliberately OUTSIDE this ignore — which
   parameters we ask Google for is the opposite of thin, and got a rower a
   sign-in screen that never appeared (`google.test.ts`). */
export async function createGoogleProvider(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<OAuthProvider> {
  const config = await client.discovery(
    new URL("https://accounts.google.com"),
    opts.clientId,
    opts.clientSecret,
  );

  return {
    async authorizationUrl() {
      const verifier = client.randomPKCECodeVerifier();
      const challenge = await client.calculatePKCECodeChallenge(verifier);
      const state = client.randomState();
      /* v8 ignore stop */
      const url = client.buildAuthorizationUrl(config, {
        redirect_uri: opts.redirectUri,
        scope: "openid email profile",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        // ASK GOOGLE TO LET THE ROWER PICK. Omitted — which is what we sent
        // until 2026-09-07 — a rower still signed into Google in this
        // browser is returned to the app with no screen at all, so signing
        // out and back in silently reuses the same account. Google's own
        // words for this value: "The authorization server prompts the user
        // to select a user account."
        //
        // NOTE THE ASYMMETRY WITH NATIVE, because the native spec REJECTS
        // the equivalent-looking option and this is not that. On native the
        // app held a Google session of its OWN, in its keychain, and sign
        // out is supposed to end it — so `forcePrompt` there would have
        // masked a state we control and should have fixed. Here the session
        // is the BROWSER's cookie with Google. It is not ours, and clearing
        // it would sign the rower out of Gmail along with us. Asking for
        // account selection is therefore the correct mechanism on this
        // platform, not a symptom mask.
        prompt: "select_account",
      });
      /* v8 ignore start */
      return {
        url: url.href,
        cookiePayload: JSON.stringify({ state, verifier }),
      };
    },

    async callbackClaims(currentUrl, cookiePayload) {
      const { state, verifier } = JSON.parse(cookiePayload) as {
        state: string;
        verifier: string;
      };
      const tokens = await client.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: verifier,
        expectedState: state,
      });
      const c = tokens.claims();
      if (!c) throw new Error("no id token claims");
      return {
        sub: String(c.sub),
        email: String(c.email ?? ""),
        emailVerified: c.email_verified === true,
        name: String(c.name ?? c.email ?? "Rower"),
      };
    },
  };
}
/* v8 ignore stop */
