import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { cacheFingerprint, lintInvocations, runLint } from "./lint-run.mjs";

const cacheLocation = "/tmp/eslint/cache.cache";
const expectedPartitions = [
  [
    "src",
    "domain",
    "scripts",
    "shared",
    "--ignore-pattern",
    "**/*.test.{ts,tsx}",
  ],
  [
    "src/**/*.test.{ts,tsx}",
    "domain/**/*.test.{ts,tsx}",
    "scripts/**/*.test.{ts,tsx}",
    "shared/**/*.test.{ts,tsx}",
    "--no-error-on-unmatched-pattern",
  ],
  ["server"],
  ["e2e"],
  ["*.{js,mjs,cjs,ts,tsx}"],
  ["."],
];
const cacheArgs = [
  "--cache",
  "--cache-strategy",
  "content",
  "--cache-location",
  cacheLocation,
];

const fixtures: string[] = [];

async function workspace(): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), "ergomatic-lint-run-"));
  fixtures.push(cwd);
  await Promise.all([
    writeFile(path.join(cwd, "pnpm-lock.yaml"), "lock"),
    writeFile(path.join(cwd, "eslint.config.js"), "config"),
    writeFile(path.join(cwd, "eslint-suppressions.json"), "suppressions"),
  ]);
  return cwd;
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map((fixture) => rm(fixture, { recursive: true })),
  );
});

describe("lintInvocations", () => {
  it("runs every cold partition followed by an authoritative full sweep", () => {
    const invocations = lintInvocations({ cacheLocation });

    expect(
      invocations.map((args) => args.slice(0, -cacheArgs.length)),
    ).toStrictEqual(expectedPartitions);
    expect(invocations.at(-1)?.[0]).toBe(".");
  });

  it("uses one content cache and never enables ESLint concurrency", () => {
    const invocations = lintInvocations({ cacheLocation });

    for (const args of invocations) {
      expect(args.slice(-cacheArgs.length)).toStrictEqual(cacheArgs);
      expect(args).not.toContain("--concurrency");
    }
  });

  it("uses exactly one uncached native prune invocation", () => {
    expect(lintInvocations({ cacheLocation, prune: true })).toStrictEqual([
      [".", "--prune-suppressions"],
    ]);
  });
});

describe("cacheFingerprint", () => {
  it("changes for Node and every cache-identity input", () => {
    const files: Array<[string, string]> = [
      ["pnpm-lock.yaml", "lock"],
      ["eslint.config.js", "config"],
      ["eslint-suppressions.json", "suppressions"],
    ];
    const fingerprint = (nodeVersion: string, nextFiles = files) =>
      cacheFingerprint({ nodeVersion, files: nextFiles });

    const variants = [
      fingerprint("v26.5.0"),
      fingerprint("v26.6.0"),
      ...files.map((_, changedIndex) =>
        fingerprint(
          "v26.5.0",
          files.map(([name, contents], index) => [
            name,
            index === changedIndex ? `${contents}-changed` : contents,
          ]),
        ),
      ),
    ];

    expect(new Set(variants).size).toBe(variants.length);
  });
});

describe("runLint", () => {
  it("stops at the first non-zero ESLint result", async () => {
    const cwd = await workspace();
    const runChild = vi
      .fn()
      .mockReturnValueOnce({ status: 0, signal: null })
      .mockReturnValueOnce({ status: 23, signal: null });

    const status = runLint({ cwd, platform: "linux", runChild });

    expect(status).toBe(23);
    expect(runChild).toHaveBeenCalledTimes(2);
  });

  it.each(["2", "4", "", "7", new Error("sysctl failed")])(
    "defers Darwin lint at pressure result %s before creating cache or children",
    async (pressure) => {
      const cwd = await workspace();
      const runChild = vi.fn(() => ({ status: 0, signal: null }));
      const readPressure =
        pressure instanceof Error
          ? vi.fn(() => {
              throw pressure;
            })
          : vi.fn(() => pressure);

      const status = runLint({
        cwd,
        platform: "darwin",
        readPressure,
        runChild,
        logError: vi.fn(),
      });

      expect(status).toBe(75);
      expect(runChild).not.toHaveBeenCalled();
      await expect(
        access(path.join(cwd, "node_modules", ".cache", "eslint")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("runs on Darwin only when pressure is normal", async () => {
    const cwd = await workspace();
    const runChild = vi.fn(() => ({ status: 0, signal: null }));

    const status = runLint({
      cwd,
      platform: "darwin",
      readPressure: () => "1\n",
      runChild,
    });

    expect(status).toBe(0);
    expect(runChild).toHaveBeenCalledTimes(expectedPartitions.length);
  });

  it("does not probe macOS pressure on other platforms", async () => {
    const cwd = await workspace();
    const readPressure = vi.fn(() => "4");
    const runChild = vi.fn(() => ({ status: 0, signal: null }));

    expect(runLint({ cwd, platform: "linux", readPressure, runChild })).toBe(0);
    expect(readPressure).not.toHaveBeenCalled();
  });

  it("re-signals the process when ESLint is killed", async () => {
    const cwd = await workspace();
    const resignal = vi.fn();

    const status = runLint({
      cwd,
      platform: "linux",
      runChild: () => ({ status: null, signal: "SIGTERM" }),
      resignal,
    });

    expect(resignal).toHaveBeenCalledWith("SIGTERM");
    expect(status).toBe(1);
  });

  it("runs prune as one uncached child after the pressure guard", async () => {
    const cwd = await workspace();
    const runChild = vi.fn((_command: string, _args: string[]) => ({
      status: 0,
      signal: null,
    }));

    expect(runLint({ cwd, platform: "linux", prune: true, runChild })).toBe(0);
    expect(runChild).toHaveBeenCalledTimes(1);
    expect(runChild.mock.calls[0]?.[1]).toStrictEqual([
      ".",
      "--prune-suppressions",
    ]);
  });
});
