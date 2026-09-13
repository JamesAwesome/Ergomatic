import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { baseDeps } from "../testDeps.js";
import { frontDoorConfig } from "./frontDoor.js";

describe("front-door boot and options", () => {
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
});
