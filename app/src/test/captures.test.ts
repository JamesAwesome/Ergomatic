import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capturePath, readCapture, SESSIONS_DIR } from "./captures";
import { parseRecording } from "../monitor/transports/recording";

describe("SESSIONS_DIR", () => {
  it("resolves to docs/monitor/sessions and exists on disk", () => {
    expect(SESSIONS_DIR.endsWith("docs/monitor/sessions")).toBe(true);
    expect(existsSync(SESSIONS_DIR)).toBe(true);
  });
});

describe("readCapture", () => {
  it("gunzips a .jsonl.gz capture into parseable recording text", () => {
    const text = readCapture(
      "walk-2026-08-23",
      "keystone-pm5-recording-1787491974452.jsonl.gz",
    );
    const parsed = parseRecording(text);
    expect(parsed.header.v).toBe("pm5-recording/v1");
    expect(parsed.events.length).toBeGreaterThan(0);
  });

  it("reads a plain .jsonl capture with no gunzip step", () => {
    const text = readCapture(
      "walk-2026-08-16",
      "session-1-keystone-2x250r0.jsonl",
    );
    const parsed = parseRecording(text);
    expect(parsed.header.v).toBe("pm5-recording/v1");
    expect(parsed.events.length).toBeGreaterThan(0);
  });

  it("throws with the attempted path in the message when the file is missing", () => {
    expect(() =>
      readCapture("walk-2026-08-23", "does-not-exist.jsonl.gz"),
    ).toThrow(/does-not-exist\.jsonl\.gz/);
  });
});

describe("capturePath", () => {
  it("joins SESSIONS_DIR, the walk dir and the file into one absolute path", () => {
    const path = capturePath(
      "walk-2026-08-16",
      "session-1-keystone-2x250r0.jsonl",
    );
    expect(path).toBe(
      `${SESSIONS_DIR}/walk-2026-08-16/session-1-keystone-2x250r0.jsonl`,
    );
    expect(existsSync(path)).toBe(true);
  });
});
