import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ON_TARGET_BAND_SECONDS as fromSurfaceModel } from "./workout/connected/surfaceModel";
import { judgeVsTarget, ON_TARGET_BAND_SECONDS } from "./judgeBand";

/** Same `import.meta.url` string-surgery technique `summaryModel.test.ts`'s
 *  `SESSIONS_DIR`/`captureReplay.test.ts` already establish (not the
 *  global `URL` constructor — this project's jsdom environment resolves
 *  `new URL(...)` against `http://localhost:3000/`, not a `file://`
 *  base), so this resolves correctly regardless of the process's cwd. */
const SURFACE_MODEL_PATH = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/judgeBand\.test\.ts$/,
    "src/workout/connected/surfaceModel.ts",
  );

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

  // Fix round (review MEDIUM): the reference-equality assertion above
  // only proves the value comparison holds TODAY — it cannot catch
  // surfaceModel.ts re-growing its own `export const
  // ON_TARGET_BAND_SECONDS = 0.5` alongside the import, since that would
  // shadow the re-export with a SECOND binding that happens to equal the
  // same number (still `.toBe(0.5)`, still passing the test above by
  // coincidence). §6.3c's own text is explicit: "a drift test FAILS if
  // either surface grows its own copy" — that needs a source-text check,
  // not a value comparison. Reads the committed file directly (this
  // repo's own `captureReplay.test.ts`/`summaryModel.test.ts` precedent
  // for asserting against real file content rather than re-importing and
  // trusting the module graph) and proves no `ON_TARGET_BAND_SECONDS =`
  // ASSIGNMENT exists there — only the `import { ON_TARGET_BAND_SECONDS
  // }` line and the `export { ON_TARGET_BAND_SECONDS };` re-export,
  // neither of which is an `=` assignment.
  it("surfaceModel.ts's own SOURCE contains no ON_TARGET_BAND_SECONDS assignment — import/re-export only, never a second definition", () => {
    const source = readFileSync(SURFACE_MODEL_PATH, "utf-8");
    expect(source).toContain(
      'import { ON_TARGET_BAND_SECONDS } from "../../judgeBand.js"',
    );
    expect(source).not.toMatch(/ON_TARGET_BAND_SECONDS\s*=(?!=)/);
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
