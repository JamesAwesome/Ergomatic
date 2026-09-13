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
  /**
   * THE EXCHANGE REQUEST ITSELF, which nothing asserted. Every fixture in the
   * branch stubbed `fetch` and read only `code`, so five separate one-line
   * production changes left the whole suite green while breaking every real
   * sign-in on a configured server: a wrong `iss` on the client secret, a
   * missing `redirect_uri`, PKCE silently off, an empty `client_secret`, or
   * the Apple and Google token URLs swapped. None of that has ever run against
   * real Apple, so a mock signer decoding its OWN claims is the only pre-
   * hardware check available — and it is a real one, because `iss`/`sub`/
   * `aud`/`kid` are ours to get right, not Apple's to validate for us.
   * `concept2/client.test.ts` pins its six-key set the same way.
   */
  async function captureExchange(
    context: Parameters<ReturnType<typeof createProviders>["verify"]>[0],
  ) {
    const seen: { url: string; body: URLSearchParams }[] = [];
    const jwk = await exportJWK(rsa.publicKey);
    const providers = createProviders(
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
        googleKeys: createLocalJWKSet({
          keys: [{ ...jwk, kid: "test", alg: "RS256" }],
        }),
        fetch: async (url, init) => {
          seen.push({
            url: String(url),
            body: new URLSearchParams(String(init?.body)),
          });
          return Response.json({
            id_token: await new SignJWT({
              sub: "apple-sub",
              email: "private@privaterelay.appleid.com",
              email_verified: "true",
              nonce: context.nonce,
            })
              .setProtectedHeader({ alg: "RS256", kid: "test" })
              .setIssuer(
                context.provider === "apple"
                  ? "https://appleid.apple.com"
                  : "https://accounts.google.com",
              )
              .setAudience(
                context.surface === "native"
                  ? context.provider === "apple"
                    ? "native.app"
                    : "google.native"
                  : context.provider === "apple"
                    ? "web.app"
                    : "google.web",
              )
              .setIssuedAt()
              .setExpirationTime("5m")
              .sign(rsa.privateKey),
            refresh_token: "retained-only-server",
          });
        },
      },
    );
    await providers.verify(context, {
      state: context.state,
      idToken: await new SignJWT({
        sub: "apple-sub",
        email: "private@privaterelay.appleid.com",
        email_verified: "true",
        nonce: context.nonce,
      })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setIssuer("https://appleid.apple.com")
        .setAudience(context.surface === "native" ? "native.app" : "web.app")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(rsa.privateKey),
      authorizationCode: "the-code",
    });
    return seen;
  }

  /**
   * `available` had no test at all, and every fixture configured all four
   * client IDs plus the secret, so its false arms were unreachable: deleting
   * the `google && web && !clientSecret` branch left the suite green while a
   * server with GOOGLE_CLIENT_ID but no GOOGLE_CLIENT_SECRET advertised
   * "Continue with Google" on web and 400d the exchange.
   */
  it.each([
    ["apple", "native", "nativeClientId"],
    ["apple", "web", "webClientId"],
    ["google", "native", "nativeClientId"],
    ["google", "web", "webClientId"],
  ] as const)(
    "%s/%s is unavailable when its %s is absent",
    async (name, surface, field) => {
      const jwk = await exportJWK(rsa.publicKey);
      const config = {
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
      };
      const keys = createLocalJWKSet({
        keys: [{ ...jwk, kid: "test", alg: "RS256" }],
      });
      expect(
        createProviders(config, { appleKeys: keys }).available(name, surface),
      ).toBe(true);
      expect(
        createProviders(
          { ...config, [name]: { ...config[name], [field]: "" } },
          { appleKeys: keys },
        ).available(name, surface),
      ).toBe(false);
    },
  );

  it("google/web is unavailable without a client secret, even with both client IDs set", async () => {
    const jwk = await exportJWK(rsa.publicKey);
    const providers = createProviders(
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
          clientSecret: "",
        },
        siteUrl: "https://erg.test",
      },
      {
        appleKeys: createLocalJWKSet({
          keys: [{ ...jwk, kid: "test", alg: "RS256" }],
        }),
      },
    );
    expect(providers.available("google", "web")).toBe(false);
    // Native Google needs no secret, so it must NOT be dragged down with it.
    expect(providers.available("google", "native")).toBe(true);
    expect(providers.available("apple", "web")).toBe(true);
  });

  it("posts the Apple web exchange to Apple's token endpoint with the exact key set, including redirect_uri", async () => {
    const [call] = await captureExchange({
      provider: "apple",
      surface: "web",
      nonce: "bound-nonce",
      state: "bound-state",
      bindingHash: "hash",
    });
    expect(call.url).toBe("https://appleid.apple.com/auth/token");
    expect([...call.body.keys()].sort()).toStrictEqual([
      "client_id",
      "client_secret",
      "code",
      "grant_type",
      "redirect_uri",
    ]);
    expect(call.body.get("grant_type")).toBe("authorization_code");
    expect(call.body.get("code")).toBe("the-code");
    expect(call.body.get("client_id")).toBe("web.app");
    // Independent literal, not `redirect(c)`: a test that imports the
    // production helper retunes with it (RF21).
    expect(call.body.get("redirect_uri")).toBe(
      "https://erg.test/api/auth/apple/callback",
    );
  });

  it("signs the Apple client secret with the team as issuer, the client as subject and the key id in the header", async () => {
    const [call] = await captureExchange({
      provider: "apple",
      surface: "native",
      nonce: "bound-nonce",
      state: "bound-state",
      bindingHash: "hash",
    });
    const secret = call.body.get("client_secret")!;
    const [header, payload] = secret
      .split(".")
      .slice(0, 2)
      .map(
        (part) =>
          JSON.parse(Buffer.from(part, "base64url").toString()) as Record<
            string,
            unknown
          >,
      );
    // Apple rejects the whole exchange with invalid_client if any of these is
    // wrong, and only Apple can tell us — so they are pinned here instead.
    expect(header.alg).toBe("ES256");
    expect(header.kid).toBe("KEY");
    expect(payload.iss).toBe("TEAM");
    expect(payload.sub).toBe("native.app");
    expect(payload.aud).toBe("https://appleid.apple.com");
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp as number).toBeGreaterThan(payload.iat as number);
    // Native carries no redirect_uri; Apple rejects one it never registered.
    expect(call.body.has("redirect_uri")).toBe(false);
  });

  it("posts the Google web exchange with its PKCE verifier and no Apple key material", async () => {
    const [call] = await captureExchange({
      provider: "google",
      surface: "web",
      nonce: "bound-nonce",
      state: "bound-state",
      bindingHash: "hash",
    });
    expect(call.url).toBe("https://oauth2.googleapis.com/token");
    expect([...call.body.keys()].sort()).toStrictEqual([
      "client_id",
      "client_secret",
      "code",
      "code_verifier",
      "grant_type",
      "redirect_uri",
    ]);
    expect(call.body.get("client_secret")).toBe("secret");
    expect(call.body.get("client_id")).toBe("google.web");
    // The PKCE verifier is the producer/consumer seam: `authorizationUrl`
    // sends S256(verifier) and this sends the verifier. Both derive from
    // bindingHash:nonce, so a non-empty value here that matches the
    // challenge is what proves the pair, not its literal text.
    const verifier = call.body.get("code_verifier")!;
    expect(verifier.length).toBeGreaterThan(20);
    expect(verifier).not.toContain("secret");
  });

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
  it("rejects a correctly shaped token signed by an untrusted key", async () => {
    const p = await provider();
    const attacker = await generateKeyPair("RS256");
    const forged = await new SignJWT({ sub: "apple-sub", nonce: "bound-nonce" })
      .setIssuer("https://appleid.apple.com")
      .setAudience("native.app")
      .setIssuedAt()
      .setExpirationTime("5m")
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .sign(attacker.privateKey);
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
  });
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
