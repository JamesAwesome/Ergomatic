import { describe, it, expect } from "vitest";
import { computeAvailable } from "./availability.js";

// Wave E PR1 Task 7 (task-7-brief.md, owed M3 from Task 6's review): Task
// 6's own unit-level availability tests only ever exercised the ROUTER's
// `available()` closure directly (a hand-set boolean) — the distinction
// between "flag off" and "creds missing" collapses into that one boolean
// before it ever reaches the router, so nothing tested the COMPOSITION
// itself. `index.ts` runs at import time and requires `DATABASE_URL` (a
// real Postgres connection), so the composition is extracted here into its
// own pure function and tested directly, never through `index.ts`.
describe("computeAvailable: C2_LINK_ENABLED flag AND both credentials", () => {
  it("flag '1' with both creds present -> true", () => {
    expect(computeAvailable("1", "client-id", "client-secret")).toBe(true);
  });

  it("flag '1' but clientSecret missing (empty string) -> false", () => {
    expect(computeAvailable("1", "client-id", "")).toBe(false);
  });

  it("flag '1' but clientId missing (empty string) -> false", () => {
    expect(computeAvailable("1", "", "client-secret")).toBe(false);
  });

  it("flag unset (undefined) with both creds present -> false", () => {
    expect(computeAvailable(undefined, "client-id", "client-secret")).toBe(
      false,
    );
  });

  it("flag '0' with both creds present -> false", () => {
    expect(computeAvailable("0", "client-id", "client-secret")).toBe(false);
  });

  it("any other flag value (e.g. 'true') -> false — only the literal '1' enables", () => {
    expect(computeAvailable("true", "client-id", "client-secret")).toBe(false);
  });
});
