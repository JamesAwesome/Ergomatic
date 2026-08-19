import { describe, expect, it } from "vitest";
import { ON_TARGET_BAND_SECONDS as fromSurfaceModel } from "./workout/connected/surfaceModel";
import { judgeVsTarget, ON_TARGET_BAND_SECONDS } from "./judgeBand";

describe("judgeBand — the one shared on-target dead band (Phase LT spec 1, §1/§6.3c)", () => {
  it("is 0.5 s/500m — the constant every boundary assertion below assumes", () => {
    expect(ON_TARGET_BAND_SECONDS).toBe(0.5);
  });

  // §6.3c: "THE BAND IS ONE CONSTANT" — surfaceModel.ts re-exports THIS
  // module's own binding (Task 2's extraction), never a second local
  // definition. Asserted by reference-equal value, not just "both equal
  // 0.5" (a coincidence two independently-chosen constants could share).
  it("surfaceModel.ts's re-exported band IS this module's own export, not a second copy", () => {
    expect(fromSurfaceModel).toBe(ON_TARGET_BAND_SECONDS);
  });

  // §1's band legs, both directions, boundary inclusive both ways (the
  // self-mutation this task's report names: flipping `<=` to `<` fails
  // exactly the two `toBe("on-target")` boundary assertions below and no
  // others).
  it("dev +0.4s: within the band, on-target", () => {
    expect(judgeVsTarget(130.4, 130)).toBe("on-target");
  });

  it("dev +0.5s exactly: still on-target — the boundary is INCLUSIVE", () => {
    expect(judgeVsTarget(130.5, 130)).toBe("on-target");
  });

  it("dev +0.6s: one tenth past the boundary — slower", () => {
    expect(judgeVsTarget(130.6, 130)).toBe("slower");
  });

  it("dev -0.5s exactly: still on-target — symmetric on the fast side", () => {
    expect(judgeVsTarget(129.5, 130)).toBe("on-target");
  });

  it("dev -0.6s: one tenth past the boundary the other way — faster", () => {
    expect(judgeVsTarget(129.4, 130)).toBe("faster");
  });

  it("dead-even (deviation exactly 0): on-target, never a bare tautological 'slower' the way the unbanded judge() reads it", () => {
    expect(judgeVsTarget(130, 130)).toBe("on-target");
  });
});
