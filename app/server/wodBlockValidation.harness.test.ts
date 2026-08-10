/**
 * Validation harness for wod-import curated blocks — not an ordinary test.
 *
 * The `wod-import` skill needs to run a curated bulk-grammar block through
 * the REAL parser (`domain/bulk.ts`) before ever showing it to James: no
 * translated block reaches him unless this gate exits 0. Task 2's original
 * design was a standalone `vite-node` script, but `vite-node` isn't
 * bundled with vitest (this repo runs vitest 4.1.10, whose own `bin` field
 * exposes only `vitest`) and isn't a dependency here, and adding it (or
 * `tsx`) means version-compat risk the repo's "verify current versions"
 * rule makes expensive for a one-script need. This harness — an
 * env-gated vitest test — is the fallback: vitest's own exit code (0 pass
 * / 1 fail) IS the gate the skill checks, in place of a script's
 * `process.exit`.
 *
 * In every normal test run (`pnpm test`, CI, this file run with no env
 * var set) the harness test below is SKIPPED via `it.skipIf` — it is
 * inert by default and never affects the push/CI gate. Only the
 * always-on companion test at the bottom runs unconditionally; it pins
 * the harness's own env-file-reading logic so this file still carries a
 * falsifying line in CI.
 *
 * Invocation (also in .claude/skills/wod-import/SKILL.md):
 *   WOD_BLOCK_FILE=/tmp/block.txt pnpm --dir app exec vitest run \
 *     --project unit server/wodBlockValidation.harness.test.ts --reporter=verbose
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseBulk, type BulkResult } from "../domain/bulk.js";

/** Reads the file named by `WOD_BLOCK_FILE`, runs it through the real
 *  `parseBulk`, and reports the verdict: `OK: <n> block(s)` (plus the
 *  dropped-wu count when nonzero) on stdout when there are no errors, or
 *  one `line <n>: <message>` per error on stderr otherwise. Returns the
 *  `BulkResult` so callers can assert on the verdict directly. */
function runBlockFile(): BulkResult {
  const path = process.env.WOD_BLOCK_FILE;
  if (!path) throw new Error("WOD_BLOCK_FILE not set");
  const text = readFileSync(path, "utf8");
  const result = parseBulk(text);
  if (result.errors.length > 0) {
    console.error("INVALID:");
    for (const e of result.errors) {
      console.error(`  line ${e.line}: ${e.message}`);
    }
  } else {
    console.log(
      `OK: ${result.workouts.length} block(s)` +
        (result.droppedWarmups > 0
          ? `, ${result.droppedWarmups} wu line(s) dropped per the warmup setting`
          : ""),
    );
  }
  return result;
}

describe("wod block validation harness", () => {
  // Inert by default — see file header. Only runs when a real invocation
  // sets WOD_BLOCK_FILE.
  it.skipIf(!process.env.WOD_BLOCK_FILE)("wod block validation", () => {
    const result = runBlockFile();
    expect(result.errors).toStrictEqual([]);
  });
});

describe("wod block validation harness reader (always-on)", () => {
  // NOT env-gated: pins the harness's own WOD_BLOCK_FILE-reading logic
  // against both a valid and an invalid block, so a change to
  // `runBlockFile` has a falsifying line in the normal CI gate even
  // though the harness test above only runs on demand.
  //
  // Its console output is captured, not printed. A real invocation's
  // exit code is the gate (see SKILL.md); the printed OK/INVALID lines
  // are just human-readable detail. If this test let its own two calls
  // print, an invalid real block's run would show this test's "OK: 1
  // block(s)" on stdout right beside the real INVALID lines (and the
  // mirror for a valid real block), so nobody could read the verdict
  // off the console alone. Asserting on the captured strings is a
  // stricter check than letting them print anyway.
  it("reads WOD_BLOCK_FILE and reports parseBulk's verdict, both directions", () => {
    const dir = mkdtempSync(join(tmpdir(), "wod-block-"));
    const path = join(dir, "block.txt");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      writeFileSync(path, "WOD Smoke | O2 | easy | 2\nw 30' 6k @20\n");
      vi.stubEnv("WOD_BLOCK_FILE", path);
      const ok = runBlockFile();
      expect(ok.errors).toStrictEqual([]);
      expect(ok.workouts).toHaveLength(1);
      expect(ok.droppedWarmups).toBe(0);
      expect(log).toHaveBeenCalledExactlyOnceWith("OK: 1 block(s)");
      expect(error).not.toHaveBeenCalled();

      log.mockClear();
      writeFileSync(path, "WOD Smoke | O2 | easy | 2\nw 10' 9k\n");
      const invalid = runBlockFile();
      expect(invalid.errors.length).toBeGreaterThan(0);
      expect(invalid.errors[0].line).toBe(2);
      expect(log).not.toHaveBeenCalled();
      expect(error).toHaveBeenNthCalledWith(1, "INVALID:");
      expect(error).toHaveBeenNthCalledWith(2, "  line 2: bad pace ref: 9k");
    } finally {
      log.mockRestore();
      error.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
