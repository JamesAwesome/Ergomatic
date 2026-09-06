import { describe, it, expect } from "vitest";
// Vite's own `?raw` import, not `node:fs`: the client project has no node
// types, and this reads the file through the same resolver the app builds
// with — no cwd assumption, and it moves if the file moves.
import source from "./Today.tsx?raw";

/**
 * Phase 7B Task 2's one obligation towards a file it must NOT change.
 *
 * 7B's spec §3 amends ROADMAP M-1's "two exceptions" for exactly ONE of
 * them: `WorkoutDetail`'s staged confirm is deliberately WIDENED to read a
 * second record. **Today's cold-start stale-draft-discard guard is the
 * other, and it is untouched** — it is M-1's named reference pattern for
 * this phase's new guards, and "go and do likewise" is worth nothing if the
 * likeness itself drifts while every behavioural test still passes.
 *
 * The behavioural pins in `Today.test.tsx` (four of them, covering both
 * records × live/completed) prove the guard still WORKS. This one proves it
 * is still the same guard, character for character — the only kind of test
 * that can fail on a "harmless" refactor of a reference pattern, and the
 * literal reading of the spec's exit criterion, "Today's guard untouched".
 *
 * If a LATER phase legitimately changes this guard, update this constant in
 * the same commit and say why in the report. Do not delete the pin.
 */
const PINNED_GUARD = `  useEffect(() => {
    const draft = loadDraft();
    const monitorRun = loadMonitorRun();
    const monitorRunIsLive =
      monitorRun !== null && monitorRun.completedAt === null;
    if (
      draft &&
      draft.startedAt === null &&
      Date.now() - new Date(draft.createdAt).getTime() > STALE_DRAFT_MS &&
      // \`?? null\`, not a bare \`?.completedAt === null\`: no run record at
      // all (the ordinary never-started-draft case this rule has always
      // covered) must still discard — only an ACTUAL completed run should
      // protect, not the absence of one coalescing to a false negative.
      (loadRun()?.completedAt ?? null) === null &&
      !monitorRunIsLive
    ) {
      clearDraft();
    }
  }, []);`;

describe("Today's cold-start guard is untouched by Phase 7B (spec §3)", () => {
  it("is present byte-identical, comment included", () => {
    expect(source).toContain(PINNED_GUARD);
  });

  it("still reads the monitor record DIRECTLY, never through anyLiveSession()", () => {
    // The M-1 failure mode, asserted at the file level rather than only
    // inside the block above: the collapsing helper may be NAMED in this
    // screen (its guard comment explains at length why it isn't used) but
    // must never be imported, which is the only way it could be called.
    //
    // F6 spec 2b, Task 4 (antagonist correction 2, binding): the import
    // WIDENED to bring in `clearMonitorRun`/`completeInterruptedRun`/
    // `MonitorRun` for Today's own new interrupted-connected-session row —
    // `loadMonitorRun` itself is untouched and still comes from the same
    // module via a named import, so the guard-block constant above (the
    // thing this pin actually protects) needed no change. Widening this
    // one line is exactly what this file's own header sanctions ("If a
    // LATER phase legitimately changes this guard, update this constant
    // ... and say why") for the import line specifically, since the import
    // is asserted here as a SEPARATE claim from the guard block itself.
    //
    // Hand-off store design spec §1, plan Task 3: widened to bring in
    // `saveMonitorRun` — `completeInterruptedRun` is now a PURE builder
    // (`monitorRun.ts`'s own doc comment on it), so `UnloggedMonitorRow`'s
    // `handleLogIt` persisted its returned record itself, as a STOPGAP until
    // Task 4 rewrote this screen's own unlogged row onto the store. Still
    // just an import-line widening; the guard block itself is untouched.
    //
    // Hand-off store design spec (rev 4), plan Task 4: NARROWED back down —
    // `clearMonitorRun`/`saveMonitorRun`/`type MonitorRun` are gone from
    // this import (the unlogged row's own discard/Log-it handlers now call
    // the store, not these), and a SECOND import line brings in the store's
    // own named functions. `loadMonitorRun` survives on its own, unchanged:
    // it is still what THIS guard block (the pin above) reads directly, and
    // it is a genuinely different call from anything the store's `read()`
    // does (this guard needs a synchronous, un-hydrated, always-fresh raw
    // read at effect time — see `monitorEntry`'s own doc comment in
    // Today.tsx for why the MOUNT SNAPSHOT reads through the store instead).
    expect(source).toContain(
      'import { loadMonitorRun } from "../monitor/monitorRun";',
    );
    expect(source).toContain(
      'import {\n  hydrate as hydrateHandoff,\n  read as readHandoff,\n  type HandoffEntry,\n} from "../monitor/handoffStore";',
    );
    expect(source).not.toMatch(/import\s*\{[^}]*\banyLiveSession\b/);
  });

  it("occurs exactly once — the guard was not duplicated instead of moved", () => {
    expect(source.split(PINNED_GUARD)).toHaveLength(2);
  });
});
