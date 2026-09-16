import type { Reporter, Vitest } from "vitest/node";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function isWitnessList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (file: unknown) =>
        typeof file === "string" &&
        /^(?:domain|server)\/.+\.test\.ts$/.test(file) &&
        !/[?*[\]{}!()\\:]/.test(file) &&
        ![...file].some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        ) &&
        !file.split("/").some((part) => !part || part === "." || part === ".."),
    )
  );
}

/** Read the same frozen options Stryker consumes, only when the owner has
 * minted this private destination. Hosted routing erases an inherited one. */
function mutationOptions(): object | undefined {
  const directory = process.env.ERGOMATIC_ARTIFACT_DIR;
  if (directory === undefined) return undefined;
  const options: unknown = JSON.parse(
    readFileSync(join(directory, "stryker.config.json"), "utf8"),
  );
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new Error("Invalid private mutation options");
  return options;
}

export function mutationWitnesses(): string[] | undefined {
  const options = mutationOptions();
  if (!options || !("testFiles" in options)) return undefined;
  if (!isWitnessList(options.testFiles))
    throw new Error("Invalid private mutation witnesses");
  return options.testFiles;
}

/** Stryker creates one Vitest context per outer runner. Check the resolved
 * context before discovery or execution, not an unrelated config declaration. */
export class MutationBudget implements Reporter {
  onInit(ctx: Vitest): void {
    const config = ctx.config;
    const options = mutationOptions();
    const expectedPool =
      options &&
      "ergomaticFailOnWorkerFailure" in options &&
      options.ergomaticFailOnWorkerFailure === true
        ? "ergomatic-threads"
        : "threads";
    if (
      config.maxWorkers !== 1 ||
      config.maxConcurrency !== 1 ||
      config.isolate !== true ||
      config.pool !== expectedPool ||
      ctx.projects.length !== 1 ||
      ctx.projects.some(
        (project) =>
          (project.config.maxWorkers ?? config.maxWorkers) !== 1 ||
          project.config.maxConcurrency !== 1 ||
          project.config.isolate !== true ||
          project.config.pool !== expectedPool ||
          project.config.browser.enabled,
      )
    )
      throw new Error(
        "Mutation inner budget requires one isolated thread and concurrency 1",
      );
    const witnesses = mutationWitnesses();
    if (
      witnesses &&
      ctx.projects.some(
        (project) =>
          JSON.stringify([...project.config.include].sort()) !==
          JSON.stringify([...witnesses].sort()),
      )
    )
      throw new Error(
        "Mutation witness membership differs from the exact requested files",
      );
  }
}
