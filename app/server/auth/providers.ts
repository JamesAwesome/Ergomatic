import { createHash } from "node:crypto";
import {
  createRemoteJWKSet,
  jwtVerify,
  SignJWT,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import * as oidc from "openid-client";
import type { AuthProvider } from "../../shared/auth.js";
import { AuthFailure, record, requiredText } from "./frontDoorErrors.js";

export interface ProviderContext {
  provider: AuthProvider;
  surface: "native" | "web";
  nonce: string;
  state: string;
  bindingHash: string;
}
export interface ProviderProof {
  state: string;
  idToken?: string;
  authorizationCode?: string;
  name?: unknown;
}
export interface VerifiedIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  grant?: { clientId: string; refreshToken: string };
}
export interface ProviderConfig {
  siteUrl: string;
  apple: {
    nativeClientId: string;
    webClientId: string;
    teamId: string;
    keyId: string;
    key: CryptoKey;
  };
  google: { nativeClientId: string; webClientId: string; clientSecret: string };
}
export function createProviders(
  config: ProviderConfig,
  hooks: {
    appleKeys?: JWTVerifyGetKey;
    googleKeys?: JWTVerifyGetKey;
    fetch?: typeof fetch;
  } = {},
) {
  const fetcher = hooks.fetch ?? fetch;
  const keys = {
    apple:
      hooks.appleKeys ??
      createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys")),
    google:
      hooks.googleKeys ??
      createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs")),
  };
  function clientId(c: ProviderContext) {
    return config[c.provider][
      c.surface === "native" ? "nativeClientId" : "webClientId"
    ];
  }
  function redirect(c: ProviderContext) {
    return new URL(`/api/auth/${c.provider}/callback`, config.siteUrl).href;
  }
  // A per-stage verifier derived from the undisclosed binding hash; nonce rotates
  // for each proof. No extra stored credential or PKCE requirement for Apple.
  function verifier(c: ProviderContext) {
    return createHash("sha256")
      .update(`${c.bindingHash}:${c.nonce}`)
      .digest("base64url");
  }
  async function claims(
    token: string,
    c: ProviderContext,
  ): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, keys[c.provider], {
      issuer:
        c.provider === "apple"
          ? "https://appleid.apple.com"
          : ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId(c),
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "nonce"],
    });
    if (payload.nonce !== c.nonce || payload.aud !== clientId(c))
      throw new AuthFailure("invalid_proof");
    requiredText(payload.sub, 255);
    return payload;
  }
  function profile(p: JWTPayload, name: unknown): VerifiedIdentity {
    let display =
      typeof name === "string"
        ? name.trim()
        : typeof p.name === "string"
          ? p.name.trim()
          : "";
    if (!display && name && typeof name === "object" && !Array.isArray(name)) {
      const n = record(name);
      display = [n.givenName, n.familyName]
        .filter((v): v is string => typeof v === "string")
        .join(" ")
        .trim();
    }
    const email = typeof p.email === "string" ? p.email.trim() : "";
    if (email.length > 320 || display.length > 200)
      throw new AuthFailure("invalid_proof");
    return {
      sub: requiredText(p.sub, 255),
      email,
      emailVerified: p.email_verified === true || p.email_verified === "true",
      name: display || "Rower",
    };
  }
  return {
    available(provider: AuthProvider, surface: "native" | "web") {
      if (
        provider === "google" &&
        surface === "web" &&
        !config.google.clientSecret
      )
        return false;
      return Boolean(
        config[provider][
          surface === "native" ? "nativeClientId" : "webClientId"
        ],
      );
    },
    async authorizationUrl(c: ProviderContext): Promise<string> {
      const apple = c.provider === "apple";
      const metadata = {
        issuer: apple
          ? "https://appleid.apple.com"
          : "https://accounts.google.com",
        authorization_endpoint: apple
          ? "https://appleid.apple.com/auth/authorize"
          : "https://accounts.google.com/o/oauth2/v2/auth",
      };
      const client = new oidc.Configuration(metadata, clientId(c));
      const params: Record<string, string> = {
        redirect_uri: redirect(c),
        scope: apple ? "openid email name" : "openid email profile",
        response_type: apple ? "code id_token" : "code",
        state: c.state,
        nonce: c.nonce,
      };
      if (apple) params.response_mode = "form_post";
      else {
        params.code_challenge = await oidc.calculatePKCECodeChallenge(
          verifier(c),
        );
        params.code_challenge_method = "S256";
        params.prompt = "select_account";
      }
      return oidc.buildAuthorizationUrl(client, params).href;
    },
    async verify(
      c: ProviderContext,
      proof: ProviderProof,
    ): Promise<VerifiedIdentity> {
      try {
        if (proof.state !== c.state || !proof.state || !c.nonce || !clientId(c))
          throw new AuthFailure("invalid_proof");
        if (c.provider === "google" && c.surface === "native")
          return profile(
            await claims(requiredText(proof.idToken), c),
            undefined,
          );
        const initial =
          c.provider === "apple"
            ? await claims(requiredText(proof.idToken), c)
            : undefined;
        const code = requiredText(proof.authorizationCode, 4096);
        let secret = config.google.clientSecret;
        if (c.provider === "apple")
          secret = await new SignJWT({})
            .setProtectedHeader({ alg: "ES256", kid: config.apple.keyId })
            .setIssuer(config.apple.teamId)
            .setSubject(clientId(c))
            .setAudience("https://appleid.apple.com")
            .setIssuedAt()
            .setExpirationTime("5m")
            .sign(config.apple.key);
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: clientId(c),
          client_secret: secret,
        });
        if (c.surface === "web") body.set("redirect_uri", redirect(c));
        if (c.provider === "google") body.set("code_verifier", verifier(c));
        const response = await fetcher(
          c.provider === "apple"
            ? "https://appleid.apple.com/auth/token"
            : "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            body,
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          },
        );
        if (!response.ok) throw new AuthFailure("invalid_proof");
        const raw = await response.text();
        if (raw.length > 65536) throw new AuthFailure("invalid_proof");
        const result = record(JSON.parse(raw) as unknown);
        const exchanged = await claims(requiredText(result.id_token), c);
        if (initial && exchanged.sub !== initial.sub)
          throw new AuthFailure("invalid_proof");
        const verified = profile(exchanged, proof.name);
        if (c.provider === "apple")
          verified.grant = {
            clientId: clientId(c),
            refreshToken: requiredText(result.refresh_token, 8192),
          };
        return verified;
      } catch {
        throw new AuthFailure("invalid_proof");
      }
    },
  };
}
export type Providers = ReturnType<typeof createProviders>;
