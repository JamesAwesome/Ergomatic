// THE TEST THAT WOULD HAVE CAUGHT IT (Phase LM PR 1 fix round 2, design
// spec `2026-08-26-lost-monitor-trigger-design.md`, Task 1).
//
// The 2026-08-26 walk (`docs/monitor/sessions/walk-2026-08-26/`) raised the
// red banner nine times in 288 s over a link that never dropped, and NO
// test in this repo could see it, by construction: every other suite mocks
// `../adapters/appLifecycle` — the seam that was wrong is the seam the
// tests replace — and `src/native/**` is excluded from the coverage gate
// (`vitest.config.ts`). So the ONE thing nobody checked was which of the
// plugin's events we actually subscribed to.
//
// This file mocks `@capacitor/app` ITSELF and pins the event STRINGS, so
// subscribing to the wrong pair fails here instead of at an erg.
//
// WHY THESE TWO STRINGS, PRIMARY (`@capacitor/app@8.1.1`'s own
// `dist/esm/definitions.d.ts`, read in this worktree's `node_modules`):
//
//   - `appStateChange` (:213) — "On iOS it's fired when the native
//     UIApplication.willResignActiveNotification and
//     UIApplication.didBecomeActiveNotification events get fired."
//     ACTIVE/INACTIVE: iOS's transient-interruption signal. A Control
//     Centre swipe, a notification peek, and the system alert that
//     precedes a permission prompt all fire it, and none of them
//     interrupts anything. This is what we used to subscribe to.
//   - `pause` (:223) — "On iOS it's fired when the native
//     UIApplication.didEnterBackgroundNotification event gets fired."
//   - `resume` (:234) — "On iOS it's fired when the native
//     UIApplication.willEnterForegroundNotification event gets fired."
//     THOSE two are the real background transitions, and they are the pair
//     this module must use.
//
// (The plugin's Swift source is fetched over SPM and is not present in this
// worktree; the doc comments above are quoted from the plugin's own shipped
// type definitions, which is the primary source reachable from here.)
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppLifecycleEvent } from "../adapters/appLifecycle";

const mocks = vi.hoisted(() => ({
  addListener: vi.fn(),
}));

vi.mock("@capacitor/app", () => ({
  App: { addListener: mocks.addListener },
}));

interface Registration {
  eventName: string;
  handler: (...args: unknown[]) => void;
  remove: ReturnType<typeof vi.fn>;
}

/** Every `App.addListener(...)` call this module made, in order, with the
 *  handler it registered and the `remove()` that handle hands back. */
let registrations: Registration[] = [];

beforeEach(() => {
  registrations = [];
  mocks.addListener.mockReset();
  mocks.addListener.mockImplementation(
    async (eventName: string, handler: (...args: unknown[]) => void) => {
      const remove = vi.fn(async () => undefined);
      registrations.push({ eventName, handler, remove });
      return { remove };
    },
  );
});

async function register(): Promise<{
  events: AppLifecycleEvent[];
  unsubscribe: () => void;
}> {
  const { registerNativeAppLifecycleListener } = await import("./appLifecycle");
  const events: AppLifecycleEvent[] = [];
  const unsubscribe = await registerNativeAppLifecycleListener((e) => {
    events.push(e);
  });
  return { events, unsubscribe };
}

describe("registerNativeAppLifecycleListener: which plugin events it binds", () => {
  it("binds `pause` and `resume` — the true background transitions — and NEVER `appStateChange`, which iOS fires on a Control Centre swipe", async () => {
    await register();

    const names = registrations.map((r) => r.eventName).sort();
    expect(names).toStrictEqual(["pause", "resume"]);
    // Stated separately as well as via the exhaustive list above: this is
    // the exact string whose nine false alarms produced this file.
    expect(names).not.toContain("appStateChange");
  });

  it("`pause` reports background and `resume` reports foreground — the vocabulary the adapter layer already speaks", async () => {
    const { events } = await register();

    const pause = registrations.find((r) => r.eventName === "pause");
    const resume = registrations.find((r) => r.eventName === "resume");
    expect(pause).toBeDefined();
    expect(resume).toBeDefined();

    pause!.handler();
    resume!.handler();
    pause!.handler();

    expect(events).toStrictEqual(["background", "foreground", "background"]);
  });

  it("the returned unsubscribe removes BOTH handles — two listeners now, so a single remove() would leak one", async () => {
    const { unsubscribe } = await register();

    unsubscribe();

    expect(registrations).toHaveLength(2);
    for (const r of registrations) expect(r.remove).toHaveBeenCalledOnce();
  });

  it("neither handler fires the callback until its plugin event does — registration alone reports nothing", async () => {
    const { events } = await register();

    expect(events).toStrictEqual([]);
  });
});
