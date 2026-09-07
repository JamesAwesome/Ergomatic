import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const census = join(import.meta.dirname, "mock-registration-census.mjs");
const dirs: string[] = [];

/** Writes one fixture file into a fresh directory and runs the census over
 *  it the way lint does, returning the exit code and what it printed. */
async function run(source: string) {
  const dir = await mkdtemp(join(tmpdir(), "mock-census-"));
  dirs.push(dir);
  await writeFile(join(dir, "fixture.test.tsx"), source);
  try {
    const { stdout } = await execFile("node", [census, dir]);
    return { code: 0, out: stdout, err: "" };
  } catch (e) {
    const failure = e as { code: number; stdout: string; stderr: string };
    return { code: failure.code, out: failure.stdout, err: failure.stderr };
  }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true })));
});

// The gate exists because `queueMock` registers each mock inside an async
// RPC `.then`: two registrations for one path race, and whichever RPC
// resolves last wins. These are the exact shape that reddened main on
// 2026-09-07 and the near-misses that must NOT be flagged.
describe("the doMock double-registration census", () => {
  it("fails, naming both helpers and the path, when one layers a second mock over the other's", async () => {
    const { code, err } = await run(`
      function mockHooks() {
        vi.doMock("../api/usePreferences", () => ({ usePreferences: ready }));
      }
      function mockHooksWithPreferencesError() {
        mockHooks();
        vi.doMock("../api/usePreferences", () => ({ usePreferences: errored }));
      }
    `);

    expect(code).toBe(1);
    expect(err).toContain("mockHooksWithPreferencesError() calls mockHooks()");
    expect(err).toContain('vi.doMock("../api/usePreferences")');
  });

  it("passes the fix: the arm is a parameter, so the path is registered once", async () => {
    const { code, out } = await run(`
      function mockHooks(arm) {
        vi.doMock("../api/usePreferences", () => ({ usePreferences: arm }));
      }
      function mockHooksWithPreferencesError() {
        mockHooks(errored);
      }
    `);

    expect(code).toBe(0);
    expect(out).toContain("OK");
  });

  it("does not flag two helpers mocking DIFFERENT paths", async () => {
    const { code } = await run(`
      function mockHooks() {
        vi.doMock("../api/useWorkouts", () => ({}));
      }
      function mockHooksWithBaselines() {
        mockHooks();
        vi.doMock("../api/useBaselines", () => ({}));
      }
    `);

    expect(code).toBe(0);
  });

  it("does not flag the same path mocked in two SEPARATE tests", async () => {
    // `vi.resetModules()` and a fresh registry stand between tests; only a
    // single test's setup can race with itself.
    const { code } = await run(`
      it("a", () => { vi.doMock("../api/usePreferences", () => ({})); });
      it("b", () => { vi.doMock("../api/usePreferences", () => ({})); });
    `);

    expect(code).toBe(0);
  });

  it("counts brace depth, so a body full of nested object literals does not end early", async () => {
    // A naive "up to the first }" parser would stop inside the factory and
    // miss the doMock that follows it — the real helper looks like this.
    const { code } = await run(`
      function mockHooks() {
        vi.doMock("../api/usePreferences", () => ({
          usePreferences: () => ({ state: "ready", preferences: { a: { b: 1 } } }),
        }));
      }
      function withError() {
        mockHooks();
        vi.doMock("../api/usePreferences", () => ({}));
      }
    `);

    expect(code).toBe(1);
  });
});
