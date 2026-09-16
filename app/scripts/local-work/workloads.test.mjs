import assert from "node:assert/strict";
import test from "node:test";
import { workloadPhases, workerSettings } from "./workloads.mjs";
import { readFileSync } from "node:fs";
import { isCI, workerCap } from "../testEnv.ts";

const app = "/checkout/app";
const plan = (name, args = [], env = {}) =>
  workloadPhases({ app, name, args, env });

test("every test entry requests the private runner outcome protocol, while other phases do not", () => {
  for (const name of ["test", "test-capture", "test-full", "test-coverage"]) {
    assert.equal(plan(name, ["--project", "unit"])[0].outcome, "test-run");
  }
  assert.equal(plan("typecheck").at(-1).outcome, undefined);
});

test("receipt worker limits agree with the real config and distinguish overrides from observed workers", () => {
  const config = readFileSync(
    new URL("../../vitest.config.ts", import.meta.url),
    "utf8",
  );
  const expression = config.match(/maxWorkers:\s*([\s\S]*?),\s*projects:/)?.[1];
  assert.ok(
    expression,
    "test must execute the actual config's maxWorkers expression",
  );
  const evaluate = new Function(
    "isCI",
    "workerCap",
    "process",
    `return ${expression}`,
  );
  for (const [env, expected, source] of [
    [{}, 4, "vitest.config.ts default"],
    [{ ERGOMATIC_TEST_WORKERS: "5" }, 5, "environment"],
  ]) {
    const configured = evaluate(() => isCI(env.CI), workerCap, { env });
    const recorded = workerSettings([], env);
    assert.equal(configured, expected);
    assert.equal(recorded.max, configured);
    assert.equal(recorded.source, source);
    assert.equal(recorded.actual, null);
  }
  for (const args of [
    ["--maxWorkers=2", "--minWorkers=1"],
    ["--max-workers", "2", "--min-workers", "1"],
  ]) {
    const recorded = workerSettings(args, { ERGOMATIC_TEST_WORKERS: "5" });
    assert.equal(recorded.max, 2);
    assert.equal(recorded.min, 1);
    assert.equal(recorded.source, "cli");
  }
  assert.equal(
    evaluate(() => isCI("true"), workerCap, { env: {} }),
    undefined,
  );
  assert.equal(workerSettings([], {}, true).max, null);
  assert.equal(workerSettings([], {}, true).source, "runner-default");
});

test("pre-commit holds lint-staged and every typecheck in one internal pipeline", () => {
  const phases = plan("pre-commit");
  assert.deepEqual(
    phases.map((p) => p.args),
    [
      ["exec", "lint-staged"],
      ["/checkout/app/node_modules/typescript/bin/tsc", "-b"],
      [
        "/checkout/app/node_modules/typescript/bin/tsc",
        "-p",
        "tsconfig.server.json",
        "--noEmit",
      ],
      [
        "/checkout/app/node_modules/typescript/bin/tsc",
        "-p",
        "tsconfig.server.build.json",
        "--noEmit",
      ],
      [
        "/checkout/app/node_modules/typescript/bin/tsc",
        "-p",
        "e2e/tsconfig.json",
        "--noEmit",
      ],
      ["scripts/e2e-typecheck-census.sh"],
    ],
  );
  assert.equal(phases[0].cwd, "/checkout");
  assert.equal(phases[1].cwd, app);
  assert.equal(
    phases.some((p) => p.args.includes("local-work.mjs")),
    false,
  );
});

test("build retains both TypeScript steps and the Vite step without recursive admission", () => {
  assert.deepEqual(
    plan("build").map((p) => p.args),
    [
      ["/checkout/app/node_modules/typescript/bin/tsc", "-b"],
      ["/checkout/app/node_modules/vite/bin/vite.js", "build"],
      [
        "/checkout/app/node_modules/typescript/bin/tsc",
        "-p",
        "tsconfig.server.build.json",
      ],
    ],
  );
});

test("test selectors reach the signal-preserving runner byte for byte", () => {
  const args = [
    "--project",
    "client",
    "src/space ü.test.tsx",
    "-t",
    "specific behavior",
  ];
  const phases = plan("test", args, {
    NODE_OPTIONS: "--max-old-space-size=1024",
    CI: "1",
  });
  assert.deepEqual(phases[0].args, ["scripts/test-run.sh", ...args]);
  assert.equal(phases[0].outcome, "test-run");
  assert.equal(phases[0].env.NODE_OPTIONS, "--max-old-space-size=1024");
  assert.equal(Object.hasOwn(phases[0].env, "CI"), false);
});

test("unknown workloads, argument separator trap and malformed worker values refuse", () => {
  assert.throws(() => plan("mystery"), /Unsupported/);
  assert.throws(
    () => plan("test", ["--project", "unit", "--", "scripts/small.test.ts"]),
    /separator/,
  );
  for (const value of ["", "0", "17", "1.5", "no", "-1"]) {
    assert.throws(
      () =>
        plan("test", ["--project", "unit"], { ERGOMATIC_TEST_WORKERS: value }),
      /worker/,
    );
  }
  assert.throws(
    () => plan("test", ["--maxWorkers", "50%", "--project", "unit"]),
    /worker/,
  );
});

test("foreground test admission does not silently include integration fixtures", () => {
  assert.throws(() => plan("test"), /project/);
  assert.throws(
    () => plan("test", ["--project", "integration"]),
    /integration/,
  );
  assert.throws(() => plan("test", ["--project", "*"]), /project/);
  assert.throws(
    () => plan("test", ["--project", "unit", "--project=integration"]),
    /integration/,
  );
  assert.equal(
    plan("test", ["--project=unit", "scripts/a.test.ts"])[0].args[1],
    "--project=unit",
  );
});

test("lint and prune retain their complete required script populations", () => {
  const lint = plan("lint").map((p) => p.args);
  assert.deepEqual(lint, [
    ["/checkout/app/node_modules/eslint/bin/eslint.js", "."],
    ["scripts/eslint-suppression-census.mjs"],
    ["scripts/nul-check.sh"],
    ["scripts/transport-census.sh"],
    ["scripts/mock-registration-census.mjs"],
  ]);
  assert.deepEqual(
    plan("lint-prune").map((p) => p.args),
    [
      [
        "/checkout/app/node_modules/eslint/bin/eslint.js",
        ".",
        "--prune-suppressions",
      ],
      ["scripts/eslint-suppression-census.mjs", "--prune"],
    ],
  );
});

test("test controls cannot bypass admission or quietly discard selectors", () => {
  for (const args of [
    ["--project"],
    ["--project="],
    ["--project", "unit", "--watch"],
    ["--project", "unit", "--browser"],
    ["--project", "unit", "--self-test"],
    ["--project", "unit", "--maxWorkers=1.5"],
  ]) {
    assert.throws(() => plan("test", args), /project|Unsupported|worker/);
  }
  assert.throws(
    () =>
      plan("test", ["--project", "unit"], {
        ERGOMATIC_TEST_RUN_BIN: "/tmp/pass",
      }),
    /Unsupported/,
  );
});

test("hosted full tests retain CI and supported project names are still validated", () => {
  const phases = workloadPhases({
    app,
    name: "test",
    hosted: true,
    env: { CI: "true" },
  });
  assert.equal(phases[0].env.CI, "true");
  assert.throws(
    () =>
      workloadPhases({ app, name: "test", hosted: true, args: ["--project="] }),
    /project/,
  );
});

test("dashed worker aliases and compact config switches cannot widen or replace the workload", () => {
  for (const flag of [
    "--max-workers=99",
    "--min-workers=0",
    "-cother.config.ts",
    "-w=true",
    "--project=unit*",
  ]) {
    assert.throws(
      () => plan("test", ["--project", "unit", flag]),
      /Unsupported|worker|project/,
    );
  }
});
