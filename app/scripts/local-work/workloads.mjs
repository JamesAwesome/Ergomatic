import { dirname, join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const positiveWorker = (value) => /^(?:[1-9]|1[0-6])$/.test(value);

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

function treeTests(directory, prefix = "src") {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory())
        return treeTests(join(directory, entry.name), relative);
      return entry.isFile() &&
        /\.test\.tsx?$/.test(entry.name) &&
        /"node:fs|from "fs"|test\/captures"/.test(
          readFileSync(join(directory, entry.name), "utf8"),
        )
        ? [relative]
        : [];
    })
    .sort();
}

/** Fixed internal phases; never call a public admission wrapper recursively. */
export function workloadPhases({
  app,
  name,
  args = [],
  env = process.env,
  hosted = false,
  allowExcluded = false,
  write = console.error,
}) {
  const childEnv = { ...env };
  if (!hosted) delete childEnv.CI;
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
  if (["test", "test-full", "test-coverage"].includes(name)) {
    const projects = testScope(args, env, hosted || name !== "test");
    if (!hosted && !allowExcluded && projects.includes("integration"))
      throw new Error(
        "integration lifecycle adapter is not installed; this foreground entry point refuses it",
      );
    if (name === "test-coverage") args = ["--coverage", ...args];
    return [shell("scripts/test-run.sh", args)];
  }
  if (args.length) throw new Error(`${name} does not accept extra arguments`);
  switch (name) {
    case "pre-push":
      return () => {
        testScope(["--project", "unit"], env);
        const base = env.PREPUSH_BASE ?? "refs/remotes/origin/main";
        if (!base || base.startsWith("-") || /[\0\r\n]/.test(base))
          throw new Error("Invalid pre-push base selector");
        const resolved = spawnSync(
          "git",
          ["rev-parse", "--verify", "--quiet", base],
          { cwd: dirname(app), encoding: "utf8", timeout: 2000 },
        );
        const scope = ["--project", "unit", "--project", "client"];
        if (resolved.status !== 0)
          write(
            `pre-push: FALLBACK -- '${base}' does not resolve, running the full scoped suite.`,
          );
        let client = [];
        try {
          client = treeTests(join(app, "src"));
        } catch {
          /* Legacy fallback retained until the selection increment. */
        }
        if (!client.length)
          write(
            "pre-push: FALLBACK -- no client whole-tree suites enumerated, running the whole client project.",
          );
        return [
          shell("scripts/test-run.sh", [
            ...(resolved.status === 0 ? ["--changed", base] : []),
            ...scope,
          ]),
          shell("scripts/test-run.sh", ["--project", "unit", "scripts/"]),
          shell("scripts/test-run.sh", ["--project", "client", ...client]),
        ];
      };
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
      return [
        {
          command: "pnpm",
          args: ["exec", "lint-staged"],
          cwd: dirname(app),
          env: childEnv,
        },
        ...typecheck(),
      ];
    default:
      throw new Error(`Unsupported workload: ${name}`);
  }
}
