import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  parseCallbackUrl,
  readConfig,
} from "./c2-crossconnect.js";

const cfg = {
  baseUrl: "https://log-dev.concept2.com",
  clientId: "cid",
  clientSecret: "sec",
  redirectUri: "http://localhost:8199/c2-callback",
};

describe("readConfig", () => {
  it("builds config from env and defaults baseUrl to log-dev", () => {
    const c = readConfig({
      C2_CLIENT_ID: "cid",
      C2_CLIENT_SECRET: "sec",
      C2_REDIRECT_URI: "http://localhost:8199/c2-callback",
    });
    expect(c.baseUrl).toBe("https://log-dev.concept2.com");
    expect(c.clientId).toBe("cid");
  });
  it("refuses to run with a missing credential, naming it", () => {
    expect(() => readConfig({ C2_CLIENT_ID: "cid" })).toThrow(
      /C2_CLIENT_SECRET/,
    );
  });
});

describe("buildAuthorizeUrl", () => {
  it("carries the four documented params plus the state probe, scope explicit", () => {
    const u = new URL(buildAuthorizeUrl(cfg, "nonce123"));
    expect(u.origin).toBe("https://log-dev.concept2.com");
    expect(u.pathname).toBe("/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("scope")).toBe("user:read,results:write");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(u.searchParams.get("state")).toBe("nonce123");
  });
});

describe("parseCallbackUrl", () => {
  it("extracts code and echoed state", () => {
    expect(
      parseCallbackUrl(
        "http://localhost:8199/c2-callback?code=abc&state=nonce123",
      ),
    ).toStrictEqual({ code: "abc", state: "nonce123" });
  });
  it("reports state null when C2 did not echo it — the probe's negative arm", () => {
    expect(
      parseCallbackUrl("http://localhost:8199/c2-callback?code=abc"),
    ).toStrictEqual({ code: "abc", state: null });
  });
  it("throws on a pasted URL with no code", () => {
    expect(() => parseCallbackUrl("http://localhost:8199/c2-callback")).toThrow(
      /code/,
    );
  });
});
