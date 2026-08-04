import { describe, it, expect } from "vitest";
import patterns from "./patterns.json";

// The digest is the content-policy boundary: aggregate statistics only.
// These tests pin the boundary, not the statistics.
describe("generation patterns digest", () => {
  it("carries the policy note and only aggregate cell fields", () => {
    expect(patterns._meta.policy).toMatch(/aggregate statistics only/i);
    const allowed = new Set([
      "n",
      "shapes",
      "workRestRatio",
      "paceOff",
      "spm",
      "warmupMinutes",
      "repsCount",
      "effortShare",
    ]);
    for (const [key, cell] of Object.entries(patterns.cells)) {
      expect(key).toMatch(/^(O2|AT|TR|AN)\|(<20|20-30|30-45|45-60|60\+)$/);
      for (const field of Object.keys(cell)) expect(allowed).toContain(field);
      expect(cell.n).toBeGreaterThan(0);
    }
  });
  it("never contains titles or prose", () => {
    const raw = JSON.stringify(patterns);
    expect(raw).not.toMatch(/"title"|"name"|"rawText"/);
  });
});
