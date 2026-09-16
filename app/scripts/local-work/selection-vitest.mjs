import fs from "node:fs";
import path from "node:path";
import { createVitest } from "vitest/node";
import { changedSourcePaths, requireRelatedInputs } from "./selection-git.mjs";
import {
  identityKey,
  requireExactMembership,
  unionIdentities,
} from "./selection.mjs";

const identity = (spec) => ({
  project: spec.project.name,
  file: fs.realpathSync(spec.moduleId),
});

async function context(app, request, coverage = false) {
  let relatedFiles;
  if (request.mode === "related") {
    const root = path.dirname(app),
      changed = changedSourcePaths(root, request.base);
    requireRelatedInputs(changed);
    relatedFiles = changed.map((file) => path.join(root, file));
  }
  const events = ["SIGINT", "SIGTERM", "exit"];
  const before = events.map((event) => new Set(process.listeners(event)));
  const pending = createVitest("test", {
    root: app,
    project: request.projects,
    run: true,
    watch: false,
    ...(request.maxWorkers === null ? {} : { maxWorkers: request.maxWorkers }),
    ...(request.minWorkers === null ? {} : { minWorkers: request.minWorkers }),
    ...(request.testNamePattern === null
      ? {}
      : { testNamePattern: request.testNamePattern }),
    ...(request.mode === "related"
      ? {
          changed: request.base,
          experimental: {
            vcsProvider: {
              async findChangedFiles() {
                return relatedFiles;
              },
            },
          },
        }
      : {}),
    ...(coverage ? { coverage: { enabled: true } } : {}),
  });
  // Installed Vitest 4 constructs its logger synchronously, before the first
  // await in createVitest. That logger shares one handler across these three
  // events, and forces process.exit after 1ms on a signal. Only detach that
  // newly registered, identity-matched handler from the two signals: the
  // selection child's handlers own cancellation and await context teardown.
  // No existing listener, exit cleanup, or later plugin listener is removed.
  const added = events.map((event, index) =>
    process.listeners(event).filter((listener) => !before[index].has(listener)),
  );
  const loggerHandler =
    added.every((listeners) => listeners.length === 1) &&
    added.every((listeners) => listeners[0] === added[0][0]);
  const noHandler = added.every((listeners) => listeners.length === 0);
  if (loggerHandler)
    for (const event of ["SIGINT", "SIGTERM"]) process.off(event, added[0][0]);
  const ctx = await pending;
  try {
    if (!loggerHandler && !noHandler)
      throw new Error("Unsupported native signal-handler registration");
    const names = ctx.projects.map((project) => project.name).sort();
    if (JSON.stringify(names) !== JSON.stringify(request.projects))
      throw new Error("Requested projects do not match native projects");
    for (const project of ctx.projects)
      if (
        project.config.browser?.enabled ||
        project.config.isolate === false ||
        project.config.pool !== "forks"
      )
        throw new Error(
          "Exact local selection requires isolated fork projects",
        );
    return ctx;
  } catch (error) {
    await ctx.close();
    throw error;
  }
}

async function withContext(app, request, coverage, signal, run) {
  signal?.throwIfAborted();
  const ctx = await context(app, request, coverage);
  let cancellation;
  const cancel = () => {
    cancellation ??= ctx.cancelCurrentRun("keyboard-input");
    cancellation.catch((error) =>
      console.error(`Native cancellation: ${error.message}`),
    );
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    signal?.throwIfAborted();
    const result = await run(ctx);
    signal?.throwIfAborted();
    return result;
  } finally {
    signal?.removeEventListener("abort", cancel);
    let closeError;
    try {
      await cancellation;
    } catch (error) {
      closeError = error;
    }
    // Vitest's close() logs rejected teardown promises instead of rejecting.
    // Retain its diagnostic and make that real native failure nonzero too.
    const logError = ctx.logger.error;
    ctx.logger.error = (...args) => {
      closeError ??= new Error(
        "Native teardown failed; see preceding diagnostic",
      );
      logError.apply(ctx.logger, args);
    };
    try {
      await ctx.close();
    } finally {
      ctx.logger.error = logError;
    }
    if (closeError) throw closeError;
    signal?.throwIfAborted();
  }
}

export async function discoverSpecifications({ app, request, signal }) {
  return withContext(app, request, false, signal, async (ctx) => {
    const all = unionIdentities(
      (await ctx.globTestSpecifications()).map(identity),
    );
    if (
      request.projects.some(
        (project) => !all.some((item) => item.project === project),
      )
    )
      throw new Error("Empty native project population");
    let selected;
    if (request.mode === "files") {
      const files = [
        ...new Set(
          request.files.map((file) => fs.realpathSync(path.resolve(app, file))),
        ),
      ];
      selected = all.filter((item) => files.includes(item.file));
      if (files.some((file) => !selected.some((item) => item.file === file)))
        throw new Error("An exact file matched no native test specification");
    } else if (request.mode === "related")
      selected = unionIdentities(
        (await ctx.getRelevantTestSpecifications()).map(identity),
      );
    else selected = all;
    return { all, selected };
  });
}

export async function executeSpecifications({
  app,
  request,
  selected,
  coverage = false,
  signal,
}) {
  // A new context, without --changed: execute the exact manifest, not a second
  // dependency decision. Its reporter and native report have one run lifetime.
  return withContext(
    app,
    { ...request, mode: "files" },
    coverage,
    signal,
    async (ctx) => {
      if (!selected.length)
        throw new Error("Cannot execute an empty selection");
      const expected = new Set(selected.map(identityKey));
      const exact = (await ctx.globTestSpecifications()).filter((spec) =>
        expected.has(identityKey(identity(spec))),
      );
      requireExactMembership(selected, exact.map(identity));
      ctx.reporters.push({
        onTestRunStart(specs) {
          signal?.throwIfAborted();
          requireExactMembership(selected, specs.map(identity));
        },
      });
      await ctx.standalone();
      signal?.throwIfAborted();
      const result = await ctx.runTestSpecifications(
        exact,
        request.mode === "full",
      );
      const executed = result.testModules.map(identity);
      requireExactMembership(selected, executed);
      const tests = result.testModules.flatMap((module) => [
        ...module.children.allTests(),
      ]);
      const failed =
        result.unhandledErrors.length > 0 ||
        result.testModules.some((module) => module.state() === "failed") ||
        ctx.state.getCountOfFailedTests() > 0 ||
        Boolean(process.exitCode);
      if (
        !failed &&
        request.testNamePattern !== null &&
        !tests.some((test) =>
          ["passed", "failed"].includes(test.result().state),
        )
      )
        throw new Error("Name filter matched no runnable tests");
      return { executed, failed };
    },
  );
}
