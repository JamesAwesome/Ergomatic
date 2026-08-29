import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ESLint } from "eslint";
import { afterEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const census = join(import.meta.dirname, "eslint-suppression-census.mjs");
const fixtures: string[] = [];

const ledger = {
  "debt.js": {
    "no-unused-vars": { count: 1 },
  },
};

async function makeFixture(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "eslint-suppression-census-"));
  fixtures.push(cwd);
  await writeFile(
    join(cwd, "eslint.config.js"),
    `export default [
  { files: ["**/*.js"], rules: { "no-unused-vars": "error" } },
  { ignores: ["ignored.js"] },
];\n`,
  );
  await writeFile(join(cwd, "debt.js"), "const debt = 1;\n");
  await writeFile(join(cwd, "configured.js"), "const configured = 1;\n");
  await writeFile(join(cwd, "ignored.js"), "const ignored = 1;\n");
  await writeFile(
    join(cwd, "eslint-suppressions.json"),
    `${JSON.stringify(ledger, null, 2)}\n`,
  );
  return cwd;
}

async function runCensus(cwd: string, prune = false) {
  try {
    const result = await execFile(process.execPath, [
      census,
      "--cwd",
      cwd,
      "--suppressions-location",
      "eslint-suppressions.json",
      ...(prune ? ["--prune"] : []),
    ]);
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failed = error as {
      code: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: failed.code,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? "",
    };
  }
}

async function lintedPaths(cwd: string): Promise<string[]> {
  const eslint = new ESLint({ cwd });
  const results = await eslint.lintFiles(["."]);
  return results.map((result) => result.filePath.replace(`${cwd}/`, "")).sort();
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((fixture) => rm(fixture, { recursive: true })),
  );
});

describe("eslint suppression census CLI", () => {
  it("accepts a debt-bearing file in ESLint's configured population", async () => {
    const cwd = await makeFixture();

    expect(await lintedPaths(cwd)).toContain("debt.js");
    expect(await runCensus(cwd)).toStrictEqual({
      code: 0,
      stdout: "",
      stderr: "",
    });
  });

  it("rejects deleted and newly ignored ledger files outside the oracle population", async () => {
    const cwd = await makeFixture();
    await rm(join(cwd, "debt.js"));

    expect(await lintedPaths(cwd)).not.toContain("debt.js");
    const deleted = await runCensus(cwd);
    expect(deleted.code).not.toBe(0);
    expect(deleted.stderr).toContain("debt.js");

    await writeFile(join(cwd, "debt.js"), "const debt = 1;\n");
    await writeFile(
      join(cwd, "eslint.config.js"),
      `export default [
  { files: ["**/*.js"], rules: { "no-unused-vars": "error" } },
  { ignores: ["ignored.js", "debt.js"] },
];\n`,
    );

    expect(await lintedPaths(cwd)).not.toContain("debt.js");
    const ignored = await runCensus(cwd);
    expect(ignored.code).not.toBe(0);
    expect(ignored.stderr).toContain("debt.js");
  });

  it("prunes only invalid top-level entries atomically and idempotently", async () => {
    const cwd = await makeFixture();
    const original = {
      "debt.js": {
        "no-unused-vars": { count: 1, note: "keep this exact data" },
      },
      "missing.js": { "no-unused-vars": { count: 3 } },
    };
    await writeFile(
      join(cwd, "eslint-suppressions.json"),
      `${JSON.stringify(original, null, 2)}\n`,
    );

    expect((await runCensus(cwd)).code).not.toBe(0);
    expect(await runCensus(cwd, true)).toStrictEqual({
      code: 0,
      stdout: "",
      stderr: "",
    });
    const once = await readFile(join(cwd, "eslint-suppressions.json"), "utf8");
    expect(once).toBe(
      `${JSON.stringify({ "debt.js": original["debt.js"] }, null, 2)}\n`,
    );
    expect(await runCensus(cwd)).toStrictEqual({
      code: 0,
      stdout: "",
      stderr: "",
    });
    expect(await runCensus(cwd, true)).toStrictEqual({
      code: 0,
      stdout: "",
      stderr: "",
    });
    expect(await readFile(join(cwd, "eslint-suppressions.json"), "utf8")).toBe(
      once,
    );
  });

  it("fails closed for malformed keys and ledgers without rewriting normal mode", async () => {
    const cwd = await makeFixture();
    const malformed = {
      "/absolute.js": ledger["debt.js"],
      "": ledger["debt.js"],
      "./debt.js": ledger["debt.js"],
      "folder\\debt.js": ledger["debt.js"],
      "../escape.js": ledger["debt.js"],
    };
    const malformedText = `${JSON.stringify(malformed, null, 2)}\n`;
    await writeFile(join(cwd, "eslint-suppressions.json"), malformedText);

    const malformedResult = await runCensus(cwd);
    expect(malformedResult.code).not.toBe(0);
    for (const key of Object.keys(malformed)) {
      expect(malformedResult.stderr).toContain(key);
    }
    expect(await readFile(join(cwd, "eslint-suppressions.json"), "utf8")).toBe(
      malformedText,
    );

    await writeFile(join(cwd, "eslint-suppressions.json"), "[]\n");
    const nonObject = await runCensus(cwd);
    expect(nonObject.code).not.toBe(0);
    expect(await readFile(join(cwd, "eslint-suppressions.json"), "utf8")).toBe(
      "[]\n",
    );
  });

  it("does not flag unrelated configured or ignored files without ledger entries", async () => {
    const cwd = await makeFixture();

    expect(await lintedPaths(cwd)).toContain("configured.js");
    expect(await lintedPaths(cwd)).not.toContain("ignored.js");
    expect(await runCensus(cwd)).toStrictEqual({
      code: 0,
      stdout: "",
      stderr: "",
    });
  });
});
