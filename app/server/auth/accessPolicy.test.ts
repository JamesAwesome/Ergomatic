import { describe, expect, it } from "vitest";
import { createAccessPolicy } from "./accessPolicy.js";

describe("account access policy", () => {
  it.each([undefined, "", "   "])(
    "defaults %j to restricted and denies an empty allowlist",
    (mode) => {
      const policy = createAccessPolicy(mode, "");
      expect(policy.mode).toBe("restricted");
      expect(policy.allows("anyone@example.com")).toBe(false);
    },
  );

  it("normalizes allowlisted email case and surrounding whitespace", () => {
    const policy = createAccessPolicy(" restricted ", " Alice@Example.COM ");
    expect(policy.allows("  alice@example.com ")).toBe(true);
    expect(policy.allows("bob@example.com")).toBe(false);
  });

  it("public mode admits every email without consulting the allowlist", () => {
    const policy = createAccessPolicy("public", "nobody@example.com");
    expect(policy.allows("someone-else@example.com")).toBe(true);
    expect(policy.allows("")).toBe(true);
  });

  it.each(["PUBLIC", "private", "1", "false"])(
    "rejects invalid ACCESS_MODE %j at boot",
    (mode) => {
      expect(() => createAccessPolicy(mode, "a@example.com")).toThrow(
        "ACCESS_MODE",
      );
    },
  );
});
