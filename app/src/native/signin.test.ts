import { describe, expect, it, vi, beforeEach } from "vitest";

// The plugin and our own two collaborators are mocked at the module seam.
// `nativeSignOut` was the only function under test here while `nativeSignIn`
// sat under a file-wide `v8 ignore`. That ignore stopped being honest once
// the wrapper grew a responseType narrow, a null-token throw, a 403 branch
// that parses a body, and a generic failure throw: four ways to be wrong, all
// invisible to coverage. It is narrowed to the two genuinely thin wrappers
// either side, and `nativeSignIn`'s branches are covered below.
const logout = vi.fn<(o: { provider: string }) => Promise<void>>();
const login = vi.fn();
const initialize = vi.fn();
vi.mock("@capgo/capacitor-social-login", () => ({
  SocialLogin: {
    initialize,
    login,
    logout: (o: { provider: string }) => logout(o),
  },
}));

const apiCalls: string[] = [];
let apiRejects = false;
// Sign-in reads the RESPONSE, sign-out only cares that the call happened, so
// the shared mock answers 204 unless a test states what the server said.
let apiAnswer: (() => Response) | null = null;
vi.mock("../api", () => ({
  api: (path: string) => {
    apiCalls.push(path);
    order.push("api");
    if (apiRejects) return Promise.reject(new Error("offline"));
    return Promise.resolve(
      apiAnswer ? apiAnswer() : new Response(null, { status: 204 }),
    );
  },
}));

const order: string[] = [];
const clearToken = vi.fn(async () => {
  order.push("clearToken");
});
const storeToken = vi.fn(async (_token: string) => {
  order.push("storeToken");
});
vi.mock("./session", () => ({
  clearToken: () => clearToken(),
  storeToken: (token: string) => storeToken(token),
  getStoredToken: vi.fn(),
}));

const { nativeSignIn, nativeSignOut } = await import("./signin");

/** The plugin's success shape, with whatever this test wants to vary. */
function loginResult(result: Record<string, unknown>) {
  login.mockResolvedValue({ provider: "google", result });
}

describe("nativeSignIn: every way it can fail says something a rower can act on", () => {
  beforeEach(() => {
    order.length = 0;
    apiCalls.length = 0;
    apiRejects = false;
    apiAnswer = null;
    login.mockReset();
    storeToken.mockClear();
  });

  it("stores the token and reports success", async () => {
    loginResult({ responseType: "online", idToken: "id-token" });
    apiAnswer = () =>
      new Response(JSON.stringify({ token: "session-token" }), {
        status: 200,
      });
    await expect(nativeSignIn()).resolves.toBe(true);
    expect(storeToken).toHaveBeenCalledWith("session-token");
  });

  // The 'offline' variant of the plugin's union carries no idToken at all, so
  // reading one off it would be `undefined` reaching the server as a bearer.
  it.each([
    ["the offline variant, which has no idToken", { responseType: "offline" }],
    ["an online response with no token", { responseType: "online" }],
  ])("refuses to sign in on %s", async (_case, result) => {
    loginResult(result);
    await expect(nativeSignIn()).rejects.toThrow(
      "Google sign-in returned no token",
    );
    expect(apiCalls).toStrictEqual([]);
  });

  // THE FOURTH DENIAL SURFACE (ROADMAP, found at #429's review). Three other
  // surfaces tell a denied rower what to do next; this one stopped after the
  // fact. The address is quoted from the server's body, so the sentence names
  // the account that was actually refused.
  it("tells a denied rower what to do next, in the same words as every other denial surface", async () => {
    loginResult({ responseType: "online", idToken: "id-token" });
    apiAnswer = () =>
      new Response(JSON.stringify({ email: "jim@example.com" }), {
        status: 403,
      });
    await expect(nativeSignIn()).rejects.toThrow(
      "jim@example.com isn't invited to this Ergomatic. Ask the owner to add you.",
    );
  });

  it("falls back to a phrase that is still a sentence when the server names no address", async () => {
    loginResult({ responseType: "online", idToken: "id-token" });
    apiAnswer = () => new Response(JSON.stringify({}), { status: 403 });
    await expect(nativeSignIn()).rejects.toThrow(
      "This account isn't invited to this Ergomatic. Ask the owner to add you.",
    );
  });

  it("says try again on any other failure, and stores nothing", async () => {
    loginResult({ responseType: "online", idToken: "id-token" });
    apiAnswer = () => new Response(null, { status: 500 });
    await expect(nativeSignIn()).rejects.toThrow("Sign-in failed. Try again.");
    expect(storeToken).not.toHaveBeenCalled();
  });
});

describe("nativeSignOut: signing out ends the GOOGLE session, not just ours", () => {
  beforeEach(() => {
    order.length = 0;
    apiCalls.length = 0;
    apiRejects = false;
    clearToken.mockClear();
    logout.mockReset();
    logout.mockImplementation(async () => {
      order.push("logout");
    });
  });

  it("tells the plugin to log Google out — without this the device's Google session survives and the next login returns silently", async () => {
    await nativeSignOut();
    expect(logout).toHaveBeenCalledWith({ provider: "google" });
  });

  it("still clears OUR token when the plugin's logout REJECTS — the assertion that stops this change making things worse", async () => {
    logout.mockRejectedValue(new Error("no active session"));
    await expect(nativeSignOut()).resolves.toBeUndefined();
    expect(clearToken).toHaveBeenCalledTimes(1);
  });

  it("clears our token BEFORE the plugin call starts, so no interleaving can leave a live token behind", async () => {
    await nativeSignOut();
    // Independent literals, not indexes derived from the array under test.
    expect(order).toStrictEqual(["clearToken", "api", "logout"]);
  });

  it("SAYS SO when the plugin's logout fails, rather than swallowing silently — a soundless failure here is indistinguishable from the bug this fixes", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    logout.mockRejectedValue(new Error("no active session"));
    await nativeSignOut();
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it("says nothing on the happy path", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await nativeSignOut();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("signs the rower out on this device even when the SERVER call fails — offline, Sign out used to do nothing at all", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    apiRejects = true;
    await expect(nativeSignOut()).resolves.toBeUndefined();
    expect(clearToken).toHaveBeenCalledTimes(1);
    // And the Google session is still ended: a failed server call must not
    // skip the rest of the teardown either.
    expect(logout).toHaveBeenCalledWith({ provider: "google" });
    err.mockRestore();
  });

  it("posts our own signout to the server", async () => {
    await nativeSignOut();
    expect(apiCalls).toStrictEqual(["/api/auth/signout"]);
  });
});
