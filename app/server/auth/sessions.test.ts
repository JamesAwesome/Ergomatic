import { describe, it, expect } from "vitest";
import { SESSION_TTL_MS, hashToken, shouldRefresh } from "./sessions.js";

describe("hashToken", () => {
  it("is a stable sha256 hex", () => {
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("shouldRefresh", () => {
  const now = new Date("2026-07-27T12:00:00Z");
  it("refreshes past the halfway point", () => {
    expect(
      shouldRefresh(new Date(now.getTime() + SESSION_TTL_MS / 2 - 1000), now),
    ).toBe(true);
  });
  it("leaves fresh sessions alone", () => {
    expect(
      shouldRefresh(new Date(now.getTime() + SESSION_TTL_MS - 1000), now),
    ).toBe(false);
  });
});
