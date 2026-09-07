import { SocialLogin } from "@capgo/capacitor-social-login";
import { api } from "../api";
import { clearToken, storeToken } from "./session";

/* v8 ignore start -- thin plugin wrapper; proven on device via TestFlight. */
export async function initNativeAuth(): Promise<void> {
  await SocialLogin.initialize({
    google: { iOSClientId: import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID ?? "" },
  });
}

/** Returns true on success; throws with a message suitable for the notice area. */
export async function nativeSignIn(): Promise<boolean> {
  const res = await SocialLogin.login({ provider: "google", options: {} });
  // GoogleLoginResponse is a discriminated union (online/offline); only the
  // 'online' variant (the default, since we never set `mode: 'offline'`)
  // carries an idToken, so narrow on responseType before reading it.
  const idToken =
    res.result.responseType === "online" ? res.result.idToken : null;
  if (!idToken) throw new Error("Google sign-in returned no token");
  const minted = await api("/api/auth/native", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (minted.status === 403) {
    const body = (await minted.json()) as { email?: string };
    throw new Error(
      `${body.email ?? "This account"} isn't invited to this Ergomatic.`,
    );
  }
  if (!minted.ok) throw new Error("Sign-in failed. Try again.");
  const body = (await minted.json()) as { token: string };
  await storeToken(body.token);
  return true;
}

/* v8 ignore stop */

/**
 * Ends BOTH sessions: ours, and the device's Google session.
 *
 * This function used to end only ours, and Google's survived — so the next
 * `SocialLogin.login()` found a live session, returned silently, and the rower
 * was back in as the same account with no chooser (James, v0.42.0 TestFlight,
 * 2026-09-07). The missing chooser is how you NOTICE; the defect was a button
 * labelled Sign out that did not.
 *
 * **THE ORDER BELOW IS LOAD-BEARING AND THE `catch` IS NOT LAZINESS.** Our own
 * teardown runs FIRST and unconditionally. If the plugin call ran first, or
 * were allowed to throw, a plugin error would leave the rower holding a valid
 * Ergomatic token while believing they had signed out — strictly worse than
 * the bug this fixes, because our token is the one that grants access to data.
 * A failed Google logout costs only the old behaviour (no chooser) and nothing
 * more, so it is swallowed deliberately.
 *
 * NOT `forcePrompt: true` on login, which the plugin also offers and which
 * would make the chooser reappear while leaving the Google session alive: that
 * fixes the symptom and leaves the state wrong (design spec, "Rejected").
 *
 * This does NOT revoke Google's grant to the app. The plugin exposes no
 * revoke; the SDK beneath it does, unexposed. Removing access is a Google
 * account settings action today.
 */
export async function nativeSignOut(): Promise<void> {
  await api("/api/auth/signout", { method: "POST" });
  await clearToken();
  try {
    await SocialLogin.logout({ provider: "google" });
  } catch {
    // Deliberately swallowed — see the ordering note above.
  }
}
