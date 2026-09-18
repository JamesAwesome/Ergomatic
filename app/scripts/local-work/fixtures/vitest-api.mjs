// Harmless boundary fixture only. The installed-runner contract is exercised
// separately by native/ tests in the app job, which has Vitest installed.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
export async function createVitest(_mode, options) {
  const projects = options.project.map((name) => ({
    name,
    config: { pool: "forks", isolate: true },
  }));
  const files = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory() && entry.name !== "node_modules"
        ? files(file)
        : entry.isFile() && /\.test\.[tj]sx?$/.test(file)
          ? [file]
          : [];
    });
  const specifications = files(options.root).flatMap((moduleId) => {
    const name = path.relative(options.root, moduleId).startsWith("src/")
      ? "client"
      : "unit";
    const project = projects.find((project) => project.name === name);
    return project ? [{ moduleId, project }] : [];
  });
  const ctx = {
    logger: { error: console.error },
    async cancelCurrentRun() {},
    projects,
    reporters: [],
    state: { getCountOfFailedTests: () => 0 },
    async globTestSpecifications() {
      return specifications;
    },
    async getRelevantTestSpecifications() {
      return fs.existsSync(path.join(options.root, ".fixture-empty-related"))
        ? []
        : specifications;
    },
    async standalone() {},
    async close() {},
    async runTestSpecifications(selected) {
      for (const reporter of ctx.reporters)
        await reporter.onTestRunStart?.(selected);
      const args = [
        "run",
        ...projects.flatMap((project) => ["--project", project.name]),
        ...selected.map((spec) => path.relative(options.root, spec.moduleId)),
        ...(options.testNamePattern ? ["-t", options.testNamePattern] : []),
      ];
      const result = spawnSync(
        process.execPath,
        [path.join(options.root, "node_modules/vitest/runner.mjs"), ...args],
        { stdio: "inherit" },
      );
      if (result.signal) {
        process.kill(process.pid, result.signal);
        // Deliver the real signal before returning this fake's synchronous
        // spawn result; the production child now awaits cancellation itself.
        await new Promise((resolve) => setImmediate(resolve));
      }
      process.exitCode = result.status ?? 1;
      return {
        unhandledErrors: [],
        testModules: selected.map((spec) => ({
          ...spec,
          state: () => (result.status ? "failed" : "passed"),
          children: {
            allTests: () => [{ result: () => ({ state: "passed" }) }],
          },
        })),
      };
    },
  };
  return ctx;
}
