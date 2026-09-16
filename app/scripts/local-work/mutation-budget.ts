import type { Reporter, Vitest } from "vitest/node";

/** Stryker creates one Vitest context per outer runner. Check the resolved
 * context before discovery or execution, not an unrelated config declaration. */
export class MutationBudget implements Reporter {
  onInit(ctx: Vitest): void {
    const config = ctx.config;
    if (
      config.maxWorkers !== 1 ||
      config.maxConcurrency !== 1 ||
      config.isolate !== true ||
      config.pool !== "threads" ||
      ctx.projects.length !== 1 ||
      ctx.projects.some(
        (project) =>
          project.config.isolate !== true ||
          project.config.pool !== "threads" ||
          project.config.browser.enabled,
      )
    )
      throw new Error(
        "Mutation inner budget requires one isolated thread and concurrency 1",
      );
  }
}
