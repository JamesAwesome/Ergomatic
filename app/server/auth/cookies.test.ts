import { describe, it, expect } from "vitest";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  clearOauthCookie,
  clearSessionCookie,
  getCookie,
  oauthCookie,
  sessionCookie,
} from "./cookies.js";

describe("cookies", () => {
  it("session cookie carries HttpOnly, Lax, Path=/, and a Max-Age", () => {
    const c = sessionCookie("tok", new Date(Date.now() + 60_000));
    expect(c).toContain(`${SESSION_COOKIE}=tok`);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/");
    expect(c).toMatch(/Max-Age=(59|60)/);
  });
  it("clear uses identical attributes with Max-Age=0", () => {
    const c = clearSessionCookie();
    expect(c).toContain("Max-Age=0");
    expect(c).toContain("Path=/");
    expect(c).toContain("HttpOnly");
  });
  it("oauth cookie is scoped to /api/auth and short-lived", () => {
    expect(oauthCookie("x")).toContain("Path=/api/auth");
    expect(oauthCookie("x")).toContain("Max-Age=600");
    expect(clearOauthCookie()).toContain("Path=/api/auth");
  });
  it("getCookie parses a header", () => {
    expect(getCookie(`${OAUTH_COOKIE}=abc; other=1`, OAUTH_COOKIE)).toBe("abc");
    expect(getCookie(undefined, OAUTH_COOKIE)).toBeUndefined();
  });
});
