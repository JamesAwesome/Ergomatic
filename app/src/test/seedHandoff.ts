import type { MonitorRun } from "../monitor/monitorRun";
// The store's own ref type, not a second spelling of it (Phase MD PR 1,
// harden lens 2): a local `{ sessionKey; revision }` interface here would
// drift from `HandoffRef` the moment the store's changed. A type-only
// import, so it does not pull the store's module instance in ahead of the
// dynamic import below — the reason that import is dynamic does not apply
// to types, which are erased.
import type { HandoffRef } from "../monitor/handoffStore";

function refuse(reason: string, run: MonitorRun): never {
  throw new Error(
    `seedMonitorRun refused (${reason}) for ${run.startedAt} — reset the store or retire the current entry first`,
  );
}

/** Seeds a MonitorRun the way production writes one: through the store's
 *  `commit`. Replaces the deleted `saveMonitorRun` fixture seeder (Phase MD
 *  PR 1) so no test starts DOWNSTREAM of the producer (RF24). Throws on a
 *  refused commit: a fixture that silently failed to seed is how a green
 *  suite hides a broken seam.
 *
 *  Dynamic import on purpose — a file that calls `vi.resetModules()` per
 *  test must seed the store instance the screen will import NEXT, not one
 *  this module cached at load. Use this form by default. */
export async function seedMonitorRun(run: MonitorRun): Promise<HandoffRef> {
  const store = await import("../monitor/handoffStore");
  const result = store.commit(run.startedAt, null, run);
  if (!result.accepted) refuse(result.reason, run);
  if (result.verdict === "failed") {
    // A memory-only seed is a different fixture, not a quieter version of
    // this one: a reload would not see it. If that is the point of the
    // test, call `commit()` directly and assert on the verdict.
    refuse("durable write denied", run);
  }
  return { sessionKey: run.startedAt, revision: result.revision };
}
