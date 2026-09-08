import { describe, expect, it, vi, beforeEach } from "vitest";

// `openid-client` is mocked so we can read the params we hand it. This file
// exists because `google.ts` was entirely `v8 ignore`d as a "thin wrapper",
// and the one thing in it that is NOT thin is which parameters we ask Google
// for — a wrong answer there is invisible until a human notices a missing
// screen, which is exactly how this bug reached a rower.
let captured: Record<string, unknown> | null = null;

vi.mock("openid-client", () => ({
  discovery: vi.fn(async () => ({ marker: "config" })),
  randomPKCECodeVerifier: () => "the-verifier",
  calculatePKCECodeChallenge: vi.fn(async () => "the-challenge"),
  randomState: () => "the-state",
  buildAuthorizationUrl: (
    _config: unknown,
    params: Record<string, unknown>,
  ) => {
    captured = params;
    return new URL("https://accounts.google.com/o/oauth2/v2/auth?x=1");
  },
  authorizationCodeGrant: vi.fn(),
}));

const { createGoogleProvider } = await import("./google");

async function buildParams(): Promise<Record<string, unknown>> {
  const provider = await createGoogleProvider({
    clientId: "cid",
    clientSecret: "secret",
    redirectUri: "https://example.test/api/auth/callback",
  });
  await provider.authorizationUrl();
  if (!captured) throw new Error("buildAuthorizationUrl was never called");
  return captured;
}

describe("the web authorization URL", () => {
  beforeEach(() => {
    captured = null;
  });

  it("asks Google to let the rower PICK an account, so signing out and back in does not silently reuse the last one", async () => {
    // Google's own words for this value: "The authorization server prompts
    // the user to select a user account." Omitted — which is what we sent
    // before — a rower who is still signed into Google in this browser is
    // returned straight to the app with no screen at all, which is the bug.
    expect((await buildParams()).prompt).toBe("select_account");
  });

  it("still sends the PKCE challenge, the state and the redirect — the account prompt must not displace them", async () => {
    const p = await buildParams();
    expect(p.code_challenge).toBe("the-challenge");
    expect(p.code_challenge_method).toBe("S256");
    expect(p.state).toBe("the-state");
    expect(p.redirect_uri).toBe("https://example.test/api/auth/callback");
    expect(p.scope).toBe("openid email profile");
  });
});
