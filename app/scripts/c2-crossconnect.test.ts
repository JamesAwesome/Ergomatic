import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  buildResultPost,
  c2Tenths,
  diffRowVsResult,
  formatC2Date,
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

// The fixture mirrors a real stored row's shape (spec §Mapping): work/rest
// split per RC-1, machine avgStrokeRate flat on the summary blob. Values are
// realistic wire-shaped numbers (tenths-precision seconds, whole meters).
const row = {
  workSeconds: 254.8,
  workMeters: 935,
  restSeconds: 180,
  restMeters: 64,
  avgStrokeRate: 24,
};
const opts = {
  weightClass: "H" as const,
  date: new Date("2026-08-26T13:40:00Z"),
  tz: "America/Los_Angeles",
};

describe("c2Tenths", () => {
  it("matches C2's own documented example: one minute is 600", () => {
    expect(c2Tenths(60)).toBe(600); // independent literal, not derived (RF21)
  });
  it("rounds tenths-precision sums exactly", () => {
    expect(c2Tenths(254.8)).toBe(2548);
    expect(c2Tenths(12 * 32.7)).toBe(3924); // anchor V8's probe value
  });
});

describe("formatC2Date", () => {
  it("renders LOCAL wall clock in the given zone, yyyy-mm-dd hh:mm:ss", () => {
    // 13:40Z on 2026-08-26 is 06:40 in Los Angeles (PDT, UTC-7).
    expect(
      formatC2Date(new Date("2026-08-26T13:40:00Z"), "America/Los_Angeles"),
    ).toBe("2026-08-26 06:40:00");
  });
  it("crosses the calendar-day boundary the spec warns about (anchor K3)", () => {
    // 02:30Z on 2026-08-27 is 19:30 the PREVIOUS day in Los Angeles.
    expect(
      formatC2Date(new Date("2026-08-27T02:30:00Z"), "America/Los_Angeles"),
    ).toBe("2026-08-26 19:30:00");
  });
});

describe("buildResultPost", () => {
  it("builds the spec's summary-level post: work-only distance/time, rest split out, tz first-class", () => {
    const p = buildResultPost(row, opts);
    expect(p).toStrictEqual({
      type: "rower",
      date: "2026-08-26 06:40:00",
      timezone: "America/Los_Angeles",
      distance: 935,
      time: 2548,
      weight_class: "H",
      rest_time: 1800,
      rest_distance: 64,
      stroke_rate: 24,
    });
  });
  it("omits rest fields on a zero-rest row and workout_type when absent", () => {
    const p = buildResultPost({ ...row, restSeconds: 0, restMeters: 0 }, opts);
    expect(p).not.toHaveProperty("rest_time");
    expect(p).not.toHaveProperty("rest_distance");
    expect(p).not.toHaveProperty("workout_type");
  });
  it("carries workout_type when supplied (the zero-rest probe needs it)", () => {
    const p = buildResultPost(row, {
      ...opts,
      workoutType: "VariableInterval",
    });
    expect(p.workout_type).toBe("VariableInterval");
  });
  it("honours timeOverrideTenths — the red-proof's deliberate wrong encoding", () => {
    const p = buildResultPost(row, { ...opts, timeOverrideTenths: 255 });
    expect(p.time).toBe(255);
  });
});

describe("diffRowVsResult", () => {
  const result = {
    id: 339,
    date: "2026-08-26 06:40:00",
    timezone: "America/Los_Angeles",
    distance: 935,
    time: 2548,
    weight_class: "H",
  };
  it("matches a faithful round-trip and marks the result-object-blind fields", () => {
    const diffs = diffRowVsResult(row, opts, result);
    expect(diffs.find((d) => d.field === "distance")?.verdict).toBe("match");
    expect(diffs.find((d) => d.field === "time")?.verdict).toBe("match");
    expect(diffs.find((d) => d.field === "rest_time")?.verdict).toBe(
      "invisible-to-result-object",
    );
    expect(diffs.find((d) => d.field === "stroke_rate")?.verdict).toBe(
      "invisible-to-result-object",
    );
  });
  it("goes RED when C2's copy disagrees with the stored row (the gate can fail)", () => {
    const diffs = diffRowVsResult(row, opts, { ...result, time: 255 });
    expect(diffs.find((d) => d.field === "time")?.verdict).toBe("MISMATCH");
  });
});
