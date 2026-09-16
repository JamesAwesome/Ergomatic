import { dirname, join } from "node:path";
import { parseSelection } from "./selection.mjs";
import { classifyStagedDocs } from "./docs-only.mjs";
import { parseMutation } from "./mutation.mjs";

const positiveWorker = (value) => /^(?:[1-9]|1[0-6])$/.test(value);

// The configured upper bound is not an observed number of workers. CLI
// overrides win over vitest.config.ts's local env/default cap.
export function workerSettings(args, env, hosted = false) {
  let max = hosted ? null : Number(env.ERGOMATIC_TEST_WORKERS ?? 4);
  let source = hosted
    ? "runner-default"
    : env.ERGOMATIC_TEST_WORKERS
      ? "environment"
      : "vitest.config.ts default";
  let min = null;
  for (let i = 0; i < args.length; i++) {
    const match = args[i].match(
      /^--(maxWorkers|max-workers|minWorkers|min-workers)(?:=(.*))?$/,
    );
    if (!match) continue;
    const value = Number(match[2] ?? args[++i]);
    if (match[1].startsWith("max")) {
      max = value;
      source = "cli";
    } else min = value;
  }
  return {
    applicability: "vitest",
    max,
    min,
    source,
    actual: null,
    reason:
      "Configured limits only; native reports do not establish the actual concurrent worker count",
  };
}

export function testScope(args, env, allowFull = false) {
  if (args.includes("--"))
    throw new Error(
      "Argument separator can drop test scope; pass test paths directly",
    );
  if (
    env.ERGOMATIC_TEST_WORKERS !== undefined &&
    !positiveWorker(env.ERGOMATIC_TEST_WORKERS)
  )
    throw new Error("Invalid worker limit: use an integer from 1 through 16");
  const projects = [];
  if (env.ERGOMATIC_TEST_RUN_BIN !== undefined)
    throw new Error("Unsupported test runner override");
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (
      /^(?:--(?:watch|browser|ui|self-test|config|workspace|poolOptions|pool)(?:[.=]|$)|-[wc])/.test(
        arg,
      )
    )
      throw new Error(`Unsupported test control: ${arg}`);
    if (arg === "--project") projects.push(args[++i]);
    else if (arg.startsWith("--project="))
      projects.push(arg.slice("--project=".length));
    else if (
      /^--(?:maxWorkers|minWorkers|max-workers|min-workers)$/.test(arg)
    ) {
      if (!positiveWorker(args[++i]))
        throw new Error("Invalid worker override");
    } else if (
      /^--(?:maxWorkers|minWorkers|max-workers|min-workers)=/.test(arg) &&
      !positiveWorker(arg.split("=")[1])
    )
      throw new Error("Invalid worker override");
  }
  if (
    projects.some((p) => !["unit", "client", "integration"].includes(p)) ||
    (!allowFull && !projects.length)
  )
    throw new Error(
      "Select a supported explicit project: unit or client (integration is excluded from admission)",
    );
  return projects.length ? projects : ["unit", "client", "integration"];
}

export const selectionMode = (name) =>
  ["test-full", "test-coverage"].includes(name)
    ? "full"
    : name === "test-related"
      ? "related"
      : "files";

/** Fixed internal phases; never call a public admission wrapper recursively. */
export function workloadPhases({
  app,
  name,
  args = [],
  env = process.env,
  hosted = false,
  allowExcluded = false,
  push,
  write = console.error,
}) {
  const childEnv = { ...env };
  if (!hosted) delete childEnv.CI;
  delete childEnv.ERGOMATIC_FULL_PUSH_FD;
  delete childEnv.ERGOMATIC_ARTIFACT_DIR;
  const node = (file, rest = []) => ({
    command: process.execPath,
    args: [file, ...rest],
    cwd: app,
    env: childEnv,
  });
  const shell = (file, rest = []) => ({
    command: "bash",
    args: [file, ...rest],
    cwd: app,
    env: childEnv,
    ...(file === "scripts/test-run.sh"
      ? { outcome: "test-run", workers: workerSettings(rest, childEnv, hosted) }
      : {}),
  });
  const tsc = (...rest) =>
    node(join(app, "node_modules/typescript/bin/tsc"), rest);
  const typecheck = () => [
    tsc("-b"),
    tsc("-p", "tsconfig.server.json", "--noEmit"),
    tsc("-p", "tsconfig.server.build.json", "--noEmit"),
    tsc("-p", "e2e/tsconfig.json", "--noEmit"),
    shell("scripts/e2e-typecheck-census.sh"),
  ];
  const eslint = (...rest) =>
    node(join(app, "node_modules/eslint/bin/eslint.js"), [".", ...rest]);
  const selectionPhase = (payload) => ({
    ...shell("scripts/test-run.sh", ["--selection", JSON.stringify(payload)]),
    selection: true,
    workers: workerSettings(args, childEnv, hosted),
  });
  if (
    [
      "test",
      "test-capture",
      "test-full",
      "test-coverage",
      "test-list",
      "test-related",
    ].includes(name)
  ) {
    const projects = testScope(
      args,
      env,
      hosted || ["test-full", "test-coverage"].includes(name),
    );
    if (!hosted && !allowExcluded && projects.includes("integration"))
      throw new Error(
        "integration lifecycle adapter is not installed; this foreground entry point refuses it",
      );
    if (!hosted) {
      const request = parseSelection(args, selectionMode(name));
      if (name === "test-list") request.inspect = true;
      const workers = workerSettings(args, childEnv);
      if (workers.min !== null && workers.min > workers.max)
        throw new Error("Minimum workers exceeds configured maximum");
      if (!projects.includes("integration")) {
        if (name === "test-capture" && request.inspect)
          throw new Error("Native capture requires execution, not inspection");
        return [
          {
            ...selectionPhase({ request, coverage: name === "test-coverage" }),
            ...(name === "test-capture" ? { capture: "vitest" } : {}),
          },
        ];
      }
      if (request.inspect || name === "test-related")
        throw new Error(
          "Integration exact discovery awaits its lifecycle adapter",
        );
    }
    if (name === "test-coverage") args = ["--coverage", ...args];
    return [
      {
        ...shell("scripts/test-run.sh", args),
        ...(name === "test-capture" ? { capture: "vitest" } : {}),
      },
    ];
  }
  if (name === "mutate") {
    if (hosted)
      return [
        node(join(app, "node_modules/@stryker-mutator/core/bin/stryker.js"), [
          "run",
          ...args,
        ]),
      ];
    const request = parseMutation(args);
    return [
      {
        ...node("scripts/local-work/mutation-run.mjs", [
          JSON.stringify(request),
        ]),
        artifacts: true,
        outcome: "test-run",
        workers: {
          applicability: "stryker",
          max: request.concurrency,
          min: null,
          actual: null,
          source: "explicit request",
          reason:
            "Outer configured bound; each native inner context is guarded at one isolated thread",
        },
      },
    ];
  }
  if (args.length) throw new Error(`${name} does not accept extra arguments`);
  switch (name) {
    case "pre-push": {
      testScope(["--project", "unit"], env);
      if (!push) throw new Error("Pre-push requires actual Git ref input");
      return [
        selectionPhase({
          prePush: {
            ...push,
            base: env.PREPUSH_BASE ?? "refs/remotes/origin/main",
          },
        }),
      ];
    }
    case "typecheck":
      return typecheck();
    case "build":
      return [
        tsc("-b"),
        node(join(app, "node_modules/vite/bin/vite.js"), ["build"]),
        tsc("-p", "tsconfig.server.build.json"),
      ];
    case "lint":
      return [
        eslint(),
        node("scripts/eslint-suppression-census.mjs"),
        shell("scripts/nul-check.sh"),
        shell("scripts/transport-census.sh"),
        node("scripts/mock-registration-census.mjs"),
      ];
    case "lint-prune":
      return [
        eslint("--prune-suppressions"),
        node("scripts/eslint-suppression-census.mjs", ["--prune"]),
      ];
    case "pre-commit":
      return () => {
        const docs = classifyStagedDocs(dirname(app));
        write(`pre-commit: ${docs.reason}`);
        const check = node(
          "scripts/local-work/docs-check.mjs",
          docs.docsOnly ? ["--require-docs"] : [],
        );
        if (docs.docsOnly) return [check];
        return [
          check,
          {
            command: process.execPath,
            args: [
              join(dirname(app), "node_modules/lint-staged/bin/lint-staged.js"),
              "--concurrent",
              "false",
            ],
            verifySourceOnFailure: true,
            cwd: dirname(app),
            env: childEnv,
          },
          ...typecheck(),
        ];
      };
    default:
      throw new Error(`Unsupported workload: ${name}`);
  }
}
