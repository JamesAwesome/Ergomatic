// cookie@2 renamed the classic parse/serialize API to parseCookie and
// stringifySetCookie (which takes a single { name, value, ...attrs } object
// rather than serialize(name, value, options)). Adapted accordingly.
import { parseCookie, stringifySetCookie } from "cookie";

export const SESSION_COOKIE = "erg_session";
export const OAUTH_COOKIE = "erg_oauth";

// Secure is gated on NODE_ENV, never req.secure: cloudflared->app is plain
// HTTP inside the box, so req.secure is always false in production.
const isProd = () => process.env.NODE_ENV === "production";

export function getCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  return header ? parseCookie(header)[name] : undefined;
}

export function sessionCookie(token: string, expiresAt: Date): string {
  return stringifySetCookie({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  });
}

export function clearSessionCookie(): string {
  return stringifySetCookie({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function oauthCookie(payload: string): string {
  return stringifySetCookie({
    name: OAUTH_COOKIE,
    value: payload,
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
}

export function clearOauthCookie(): string {
  return stringifySetCookie({
    name: OAUTH_COOKIE,
    value: "",
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 0,
  });
}
