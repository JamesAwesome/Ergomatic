import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { baseDeps } from "../testDeps.js";
import type pg from "pg";
import { generateKeyPair, exportPKCS8 } from "jose";
import { createFrontDoor, frontDoorConfig } from "./frontDoor.js";

describe("front-door boot and options", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it("defaults dark and retains actual Google availability", async () => {
    const deps = baseDeps();
    const res = await request(createApp(deps)).get("/api/auth/options");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      frontDoorEnabled: false,
      apple: { native: false, web: false },
    });
  });
  it("requires every Apple configuration value only when exactly enabled", async () => {
    expect(await frontDoorConfig({}, "http://localhost:5173")).toBeNull();
    expect(
      await frontDoorConfig(
        { FRONT_DOOR_ENABLED: "true" },
        "http://localhost:5173",
      ),
    ).toBeNull();
    await expect(
      frontDoorConfig({ FRONT_DOOR_ENABLED: "1" }, "https://erg.test"),
    ).rejects.toThrow("APPLE_NATIVE_CLIENT_ID");
  });
  it("validates both Apple audiences and PKCS8 key before enabling", async () => {
    const key = await generateKeyPair("ES256", { extractable: true });
    const env = {
      FRONT_DOOR_ENABLED: "1",
      APPLE_NATIVE_CLIENT_ID: "native.app",
      APPLE_WEB_CLIENT_ID: "web.app",
      APPLE_TEAM_ID: "TEAM",
      APPLE_KEY_ID: "KEY",
      APPLE_PRIVATE_KEY: await exportPKCS8(key.privateKey),
    };
    const config = await frontDoorConfig(env, "https://erg.test");
    expect(config?.apple.nativeClientId).toBe("native.app");
    expect(config?.apple.key.algorithm.name).toBe("ECDSA");
    await expect(
      frontDoorConfig(
        { ...env, APPLE_WEB_CLIENT_ID: "native.app" },
        "https://erg.test",
      ),
    ).rejects.toThrow("distinct");
    await expect(frontDoorConfig(env, "http://erg.test")).rejects.toThrow(
      "HTTPS",
    );
    await expect(
      frontDoorConfig(
        { ...env, APPLE_PRIVATE_KEY: "invalid" },
        "https://erg.test",
      ),
    ).rejects.toThrow();
  });
  it("sweeps before readiness, fails new starts closed, recovers on minute sweep, clears timer", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error("TOP-SECRET"))
      .mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as pg.Pool;
    const key = await generateKeyPair("ES256");
    const front = await createFrontDoor(pool, baseDeps().sessions, {
      siteUrl: "https://erg.test",
      apple: {
        nativeClientId: "native.app",
        webClientId: "web.app",
        teamId: "TEAM",
        keyId: "KEY",
        key: key.privateKey,
      },
      google: { nativeClientId: "", webClientId: "", clientSecret: "" },
    });
    expect(front.attempts.healthy()).toBe(false);
    await expect(
      front.attempts.begin({
        surface: "native",
        purpose: "signin",
        targetProvider: "apple",
      }),
    ).rejects.toThrow("unavailable");
    expect(warn).toHaveBeenCalledWith(
      '{"event":"auth_attempt_cleanup_failed"}',
    );
    await vi.advanceTimersByTimeAsync(59999);
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(query).toHaveBeenCalledTimes(2);
    expect(front.attempts.healthy()).toBe(true);
    front.close();
    await vi.advanceTimersByTimeAsync(60000);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it.each([
    "/api/auth/native/attempts",
    "/api/auth/web/attempts",
    "/api/auth/methods",
  ])("new route %s stays unavailable while dark", async (path) => {
    const res = await request(createApp(baseDeps()))
      .post(path)
      .send({ purpose: "signin", provider: "apple" });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("unavailable");
  });
});
