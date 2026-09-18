import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Missing implementation is an explicit failing assertion, not an import
// crash that could be mistaken for the intended refusal.
async function api() {
  const module = await import("./mutation.mjs").catch((error) => {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
    return null;
  });
  assert.ok(module, "bounded mutation request implementation is missing");
  return module;
}

const config = {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.stryker.config.ts" },
  mutate: [
    "domain/**/*.ts",
    "server/stores/**/*.ts",
    "server/routes/**/*.ts",
    "!**/*.test.ts",
    "!**/fixtures.ts",
    "!server/stores/contracts/**",
  ],
  reporters: ["html", "clear-text", "progress"],
  coverageAnalysis: "perTest",
};

function fixture(t, settings = config) {
  const app = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "ergo-mutation-scope-")),
  );
  t.after(() => fs.rmSync(app, { recursive: true, force: true }));
  const put = (name, data = "export const value = 1;") => {
    const file = path.join(app, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  };
  put("stryker.config.json", JSON.stringify(settings));
  for (const name of [
    "domain/a.ts",
    "domain/a.test.ts",
    "domain/space ü,comma.ts",
    "domain/fixtures.ts",
    "server/stores/a.ts",
    "server/routes/a.ts",
    "server/stores/contracts/a.ts",
    "server/a.integration.test.ts",
    "src/a.ts",
  ])
    put(name);
  return { app, put };
}

test("mutation request retains each exact selector without CSV splitting", async () => {
  const { parseMutation } = await api();
  assert.deepEqual(
    parseMutation([
      "--mutate",
      "domain/space ü,comma.ts",
      "--mutate=server/routes/a.ts",
      "--test-file",
      "domain/a.test.ts",
      "--concurrency=2",
    ]),
    {
      all: false,
      files: ["domain/space ü,comma.ts", "server/routes/a.ts"],
      testFiles: ["domain/a.test.ts"],
      concurrency: 2,
    },
  );
  assert.deepEqual(parseMutation(["--all", "--concurrency", "1"]), {
    all: true,
    files: [],
    testFiles: [],
    concurrency: 1,
  });
});

test("missing or malformed mutation controls never expand to implicit full scope", async () => {
  const { parseMutation } = await api();
  for (const args of [
    [],
    ["--all"],
    ["--concurrency", "1"],
    ["--all", "--mutate", "domain/a.ts", "--concurrency", "1"],
    ...["", "0", "17", "2.5", "50%", "01"].map((n) => [
      "--all",
      "--concurrency",
      n,
    ]),
    ["--all", "--concurrency", "1", "--concurrency=2"],
    ["--all", "--all", "--concurrency=1"],
    ["--all", "--concurrency=1", "--"],
    ...["--inPlace", "--configFile=x", "domain/a.ts"].map((flag) => [
      "--all",
      "--concurrency=1",
      flag,
    ]),
    ...[
      "",
      "domain/*.ts",
      "domain/[a].ts",
      "domain/{a,b}.ts",
      "domain/+(a).ts",
      "domain/@(a).ts",
      "../domain/a.ts",
      "/domain/a.ts",
      "domain/../domain/a.ts",
      "domain/\0a.ts",
    ].map((file) => ["--concurrency=1", "--mutate", file]),
    ["--concurrency=1", "--mutate", "domain/a.ts", "--test-file", ""],
  ])
    assert.throws(() => parseMutation(args), JSON.stringify(args));
});

test("mutation selection enforces configured membership and preserves literal filenames", async (t) => {
  const { parseMutation, mutationFiles } = await api(),
    f = fixture(t);
  assert.deepEqual(
    mutationFiles(f.app, parseMutation(["--all", "--concurrency=1"])).files,
    [
      "domain/a.ts",
      "domain/space ü,comma.ts",
      "server/routes/a.ts",
      "server/stores/a.ts",
    ],
  );
  assert.deepEqual(
    mutationFiles(
      f.app,
      parseMutation([
        "--mutate",
        "domain/space ü,comma.ts",
        "--test-file",
        "domain/a.test.ts",
        "--concurrency=1",
      ]),
    ).testFiles,
    ["domain/a.test.ts"],
  );
  for (const file of [
    "domain/missing.ts",
    "src/a.ts",
    "domain/a.test.ts",
    "domain/fixtures.ts",
    "server/stores/contracts/a.ts",
  ])
    assert.throws(() =>
      mutationFiles(
        f.app,
        parseMutation(["--mutate", file, "--concurrency=1"]),
      ),
    );
  assert.throws(() =>
    mutationFiles(
      f.app,
      parseMutation([
        "--all",
        "--test-file",
        "server/a.integration.test.ts",
        "--concurrency=1",
      ]),
    ),
  );
  fs.symlinkSync(
    path.join(f.app, "src/a.ts"),
    path.join(f.app, "domain/link.ts"),
  );
  assert.throws(() =>
    mutationFiles(
      f.app,
      parseMutation(["--mutate", "domain/link.ts", "--concurrency=1"]),
    ),
  );
});

test("unsupported mutation config cannot smuggle a second producer or broader scope", async (t) => {
  const { parseMutation, mutationFiles } = await api();
  for (const extra of [
    { buildCommand: "echo producer" },
    { checkers: ["typescript"] },
    { inPlace: true },
    { vitest: { configFile: "other.ts" } },
    { plugins: ["arbitrary"] },
    { mutate: ["**/*.ts"] },
    { tempDirName: "../shared" },
    { testRunner: "command" },
  ]) {
    const f = fixture(t, { ...config, ...extra });
    assert.throws(() =>
      mutationFiles(f.app, parseMutation(["--all", "--concurrency=1"])),
    );
  }
});

test("dropped or replaced mutation controls disagree with independently recorded public intent", async (t) => {
  const { parseMutation } = await api();
  const { runMutation } = await import("./mutation-run.mjs");
  const f = fixture(t),
    directory = path.join(f.app, "receipt");
  fs.mkdirSync(directory, { mode: 0o700 });
  const args = [
    "--concurrency=1",
    "--mutate",
    "domain/a.ts",
    "--test-file",
    "domain/a.test.ts",
  ];
  fs.writeFileSync(
    path.join(directory, "receipt.json"),
    JSON.stringify({ scope: { workload: "mutate", args } }),
  );
  const intended = parseMutation(args);
  for (const payload of [
    { ...intended, concurrency: 2 },
    { ...intended, testFiles: [] },
    { ...intended, all: true, files: [] },
    { ...intended, files: ["server/routes/a.ts"] },
  ]) {
    await assert.rejects(
      runMutation(payload, f.app, directory),
      /original request/,
    );
    assert.deepEqual(fs.readdirSync(directory), ["receipt.json"]);
  }
});
