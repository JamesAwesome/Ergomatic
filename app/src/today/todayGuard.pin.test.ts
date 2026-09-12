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
 *
 * Phase MD PR 1 (2026-09-12): `anyLiveSession` was deleted, `loadMonitorRun`
 * moved into the store, and the negative import pin on `anyLiveSession` was
 * replaced by the call-count pin below — a pin on a symbol that cannot exist
 * cannot fail (RF21). The guard block itself is byte-identical to 7B's.
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

  it("imports loadMonitorRun from the STORE (Phase MD PR 1 moved it) beside the store's own hydrate/read — the raw read and the hydrated read are deliberately two different calls", () => {
    // Phase MD PR 1: `loadMonitorRun` lives in `handoffStore.ts` now, so
    // this screen's monitor imports collapse to one line. The guard block
    // above is byte-identical to before the move — only the import moved.
    // What the pin still asserts is unchanged: this guard reads the durable
    // record DIRECTLY, through a synchronous, un-hydrated, always-fresh raw
    // read at effect time — not through the store's `read()` (see
    // `monitorEntry`'s own doc comment in Today.tsx for why the MOUNT
    // SNAPSHOT reads through the store instead). The store-side half of
    // that rule — `loadMonitorRun` never consults the memory tier — is
    // `handoffStore.test.ts`'s "reads the DURABLE tier only" case.
    expect(source).toContain(
      'import {\n  hydrate as hydrateHandoff,\n  loadMonitorRun,\n  read as readHandoff,\n  type HandoffEntry,\n} from "../monitor/handoffStore";',
    );
    expect(source).not.toMatch(/from "\.\.\/monitor\/monitorRun"/);
  });

  it("the guard's raw read is the ONLY loadMonitorRun call in this screen, and it is inside the pinned block — every other monitor read here goes through the store's hydrated tier", () => {
    // Replaces the old negative pin on an `anyLiveSession` import, which
    // could never fail once that helper was deleted (RF21). The rule it
    // protected — Today's cold-start guard reads the DURABLE BYTES,
    // synchronously and un-hydrated, and asks about a live record
    // specifically — is bound here to the call itself: exactly one raw
    // read in the file, and it is the pinned one. Re-routing the guard
    // through `readHandoff()` fails this AND the byte pin above; adding a
    // second raw read anywhere else in the screen fails this alone.
    // Comments in Today.tsx mention the call in backticks (four
    // occurrences of `loadMonitorRun(` at baseline, ONE of them code); a
    // call is never preceded by a backtick or an identifier character, so
    // those are excluded — measured, not assumed.
    const calls = source.match(/(^|[^`\w])loadMonitorRun\(\)/gm) ?? [];
    expect(calls).toHaveLength(1);
    expect(PINNED_GUARD).toContain("loadMonitorRun()");
  });

  it("occurs exactly once — the guard was not duplicated instead of moved", () => {
    expect(source.split(PINNED_GUARD)).toHaveLength(2);
  });
});
