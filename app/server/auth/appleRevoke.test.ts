import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPair, jwtVerify } from "jose";
import { createAppleRevoke, type AppleGrant } from "./appleRevoke.js";
import type { ProviderConfig } from "./providers.js";

describe("revoking Apple grants after an unlink has already committed", () => {
  let ec: Awaited<ReturnType<typeof generateKeyPair>>;
  beforeAll(async () => {
    ec = await generateKeyPair("ES256");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  function config(): ProviderConfig {
    return {
      siteUrl: "https://erg.test",
      apple: {
        nativeClientId: "native.app",
        webClientId: "web.app",
        teamId: "TEAM",
        keyId: "KEY",
        key: ec.privateKey,
      },
      google: { nativeClientId: "", webClientId: "", clientSecret: "" },
    };
  }
  async function secretFrom(body: URLSearchParams) {
    return jwtVerify(body.get("client_secret")!, ec.publicKey);
  }
  it("resolves true without calling the fetcher when there are no grants", async () => {
    const fetcher = vi.fn();
    const revoke = createAppleRevoke(config(), fetcher);
    await expect(revoke([])).resolves.toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("revokes every grant with the shared client secret and Apple's revoke params", async () => {
    const fetcher = vi.fn(
      async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) =>
        new Response(null, { status: 200 }),
    );
    const revoke = createAppleRevoke(config(), fetcher);
    const grants: AppleGrant[] = [
      { clientId: "native.app", refreshToken: "rt-native" },
      { clientId: "web.app", refreshToken: "rt-web" },
    ];
    await expect(revoke(grants)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    // The two grants revoke CONCURRENTLY (Promise.allSettled over a .map),
    // so their calls can land on the mock in either order — find by the
    // token being revoked rather than assume an index.
    const [url, init] = fetcher.mock.calls.find(
      ([, i]) => (i!.body as URLSearchParams).get("token") === "rt-native",
    )!;
    expect(url).toBe("https://appleid.apple.com/auth/revoke");
    expect(init!.method).toBe("POST");
    const body = init!.body as URLSearchParams;
    expect(body.get("token")).toBe("rt-native");
    expect(body.get("token_type_hint")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("native.app");
    const { payload, protectedHeader } = await secretFrom(body);
    expect(protectedHeader.alg).toBe("ES256");
    expect(protectedHeader.kid).toBe("KEY");
    expect(payload.iss).toBe("TEAM");
    expect(payload.sub).toBe("native.app");
    expect(payload.aud).toBe("https://appleid.apple.com");
  });
  it("fails closed and logs the count when Apple rejects a grant", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn(
      async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const token = (init!.body as URLSearchParams).get("token");
        return new Response(null, { status: token === "rt-bad" ? 400 : 200 });
      },
    );
    const revoke = createAppleRevoke(config(), fetcher);
    const result = await revoke([
      { clientId: "native.app", refreshToken: "rt-good" },
      { clientId: "web.app", refreshToken: "rt-bad" },
    ]);
    expect(result).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      JSON.stringify({ event: "apple_revoke_failed", failed: 1, of: 2 }),
    );
  });
  it("treats a thrown fetch (timeout, network error) the same as a rejection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn(
      async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) => {
        throw new Error("timeout");
      },
    );
    const revoke = createAppleRevoke(config(), fetcher);
    await expect(
      revoke([{ clientId: "native.app", refreshToken: "rt" }]),
    ).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(
      JSON.stringify({ event: "apple_revoke_failed", failed: 1, of: 1 }),
    );
  });
});
