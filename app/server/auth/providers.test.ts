import { beforeAll, describe, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { createProviders } from "./providers.js";

describe("signed provider proof", () => {
  let rsa: Awaited<ReturnType<typeof generateKeyPair>>;
  let ec: Awaited<ReturnType<typeof generateKeyPair>>;
  beforeAll(async () => {
    rsa = await generateKeyPair("RS256");
    ec = await generateKeyPair("ES256");
  });
  async function token(claims: Record<string, unknown> = {}) {
    return new SignJWT({
      sub: "apple-sub",
      email: "private@privaterelay.appleid.com",
      email_verified: "true",
      nonce: "bound-nonce",
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuer("https://appleid.apple.com")
      .setAudience("native.app")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(rsa.privateKey);
  }
  async function provider(exchangeClaims: Record<string, unknown> = {}) {
    const jwk = await exportJWK(rsa.publicKey);
    const exchangeToken = await token(exchangeClaims);
    return createProviders(
      {
        apple: {
          nativeClientId: "native.app",
          webClientId: "web.app",
          teamId: "TEAM",
          keyId: "KEY",
          key: ec.privateKey,
        },
        google: {
          nativeClientId: "google.native",
          webClientId: "google.web",
          clientSecret: "secret",
        },
        siteUrl: "https://erg.test",
      },
      {
        appleKeys: createLocalJWKSet({
          keys: [{ ...jwk, kid: "test", alg: "RS256" }],
        }),
        fetch: async () =>
          Response.json({
            id_token: exchangeToken,
            refresh_token: "retained-only-server",
          }),
      },
    );
  }
  it("verifies signed native identity and exchanged subject, retaining only refresh grant", async () => {
    const p = await provider();
    expect(
      await p.verify(
        {
          provider: "apple",
          surface: "native",
          nonce: "bound-nonce",
          state: "bound-state",
          bindingHash: "hash",
        },
        {
          idToken: await token(),
          authorizationCode: "code",
          state: "bound-state",
        },
      ),
    ).toStrictEqual({
      sub: "apple-sub",
      email: "private@privaterelay.appleid.com",
      emailVerified: true,
      name: "Rower",
      grant: { clientId: "native.app", refreshToken: "retained-only-server" },
    });
  });
  it.each(["nonce", "aud", "iss", "exp"])(
    "rejects wrong signed %s",
    async (field) => {
      const p = await provider();
      const claims = { [field]: field === "exp" ? 1 : "wrong" };
      // Explicit setters in token() own issuer/audience/expiry; forge those after constructing claims.
      const forged = await new SignJWT({
        sub: "apple-sub",
        nonce: "bound-nonce",
        iss: "https://appleid.apple.com",
        aud: "native.app",
        exp: Math.floor(Date.now() / 1000) + 300,
        ...claims,
      })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .sign(rsa.privateKey);
      await expect(
        p.verify(
          {
            provider: "apple",
            surface: "native",
            nonce: "bound-nonce",
            state: "bound-state",
            bindingHash: "hash",
          },
          { idToken: forged, authorizationCode: "code", state: "bound-state" },
        ),
      ).rejects.toThrow("invalid_proof");
    },
  );
  it("rejects exchanged subject mismatch", async () => {
    const p = await provider({ sub: "another" });
    await expect(
      p.verify(
        {
          provider: "apple",
          surface: "native",
          nonce: "bound-nonce",
          state: "bound-state",
          bindingHash: "hash",
        },
        {
          idToken: await token(),
          authorizationCode: "code",
          state: "bound-state",
        },
      ),
    ).rejects.toThrow("invalid_proof");
  });
  it("rejects wrong state before exchange", async () => {
    const p = await provider();
    await expect(
      p.verify(
        {
          provider: "apple",
          surface: "native",
          nonce: "bound-nonce",
          state: "bound-state",
          bindingHash: "hash",
        },
        { idToken: await token(), authorizationCode: "code", state: "wrong" },
      ),
    ).rejects.toThrow("invalid_proof");
  });
  it("requests Apple form_post without PKCE and Google nonce with PKCE", async () => {
    const p = await provider();
    const base = {
      surface: "web" as const,
      nonce: "n",
      state: "s",
      bindingHash: "h",
    };
    const apple = new URL(
      await p.authorizationUrl({ ...base, provider: "apple" }),
    );
    const google = new URL(
      await p.authorizationUrl({ ...base, provider: "google" }),
    );
    expect(apple.searchParams.get("response_mode")).toBe("form_post");
    expect(apple.searchParams.has("code_challenge")).toBe(false);
    expect(google.searchParams.get("nonce")).toBe("n");
    expect(google.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
