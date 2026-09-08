import { describe, expect, it, vi, beforeEach } from "vitest";

// The plugin and our own two collaborators are mocked at the module seam.
// `nativeSignOut` is the ONLY function under test here: it is the one this
// change gives real behaviour to, and the one whose ORDERING can be wrong.
const logout = vi.fn<(o: { provider: string }) => Promise<void>>();
vi.mock("@capgo/capacitor-social-login", () => ({
  SocialLogin: {
    initialize: vi.fn(),
    login: vi.fn(),
    logout: (o: { provider: string }) => logout(o),
  },
}));

const apiCalls: string[] = [];
vi.mock("../api", () => ({
  api: (path: string) => {
    apiCalls.push(path);
    return Promise.resolve(new Response(null, { status: 204 }));
  },
}));

const order: string[] = [];
const clearToken = vi.fn(async () => {
  order.push("clearToken");
});
vi.mock("./session", () => ({
  clearToken: () => clearToken(),
  storeToken: vi.fn(),
  getStoredToken: vi.fn(),
}));

const { nativeSignOut } = await import("./signin");

describe("nativeSignOut: signing out ends the GOOGLE session, not just ours", () => {
  beforeEach(() => {
    order.length = 0;
    apiCalls.length = 0;
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
    expect(order).toStrictEqual(["clearToken", "logout"]);
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

  it("posts our own signout to the server", async () => {
    await nativeSignOut();
    expect(apiCalls).toStrictEqual(["/api/auth/signout"]);
  });
});
