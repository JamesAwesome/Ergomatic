import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerWebAppLifecycleListener,
  type AppLifecycleEvent,
} from "./appLifecycle";

// Same `vi.doMock("../platform")` + `vi.resetModules()` idiom
// `monitorTransport.test.ts`/`keepAwake.test.ts` already establish for this
// exact platform-branch question.

function setVisibility(state: "visible" | "hidden"): void {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
});

describe("registerWebAppLifecycleListener (the web arm, tested directly)", () => {
  beforeEach(() => {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });

  it("hidden -> background, visible -> foreground", () => {
    const events: AppLifecycleEvent[] = [];
    registerWebAppLifecycleListener((e) => events.push(e));

    setVisibility("hidden");
    setVisibility("visible");
    setVisibility("hidden");

    expect(events).toStrictEqual(["background", "foreground", "background"]);
  });

  it("the returned unsubscribe stops future events from reaching the callback", () => {
    const events: AppLifecycleEvent[] = [];
    const unsubscribe = registerWebAppLifecycleListener((e) => events.push(e));

    setVisibility("hidden");
    unsubscribe();
    setVisibility("visible");

    expect(events).toStrictEqual(["background"]);
  });

  it("two independent registrations both hear every transition — a plain addEventListener, not a single-slot registry", () => {
    const eventsA: AppLifecycleEvent[] = [];
    const eventsB: AppLifecycleEvent[] = [];
    const unsubA = registerWebAppLifecycleListener((e) => eventsA.push(e));
    const unsubB = registerWebAppLifecycleListener((e) => eventsB.push(e));

    setVisibility("hidden");

    expect(eventsA).toStrictEqual(["background"]);
    expect(eventsB).toStrictEqual(["background"]);
    unsubA();
    unsubB();
  });
});

describe("registerAppLifecycleListener: platform dispatch", () => {
  it("web: returns the unsubscribe SYNCHRONOUSLY (not a Promise) and is a genuine no-op — Phase LL minor 9 (RULED, spec amendment 2026-08-22): lifecycle-suspect marking is native-only, so the web arm never reaches the DOM listener and never calls back for either transition", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    vi.resetModules();
    const { registerAppLifecycleListener } = await import("./appLifecycle");
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");

    const events: AppLifecycleEvent[] = [];
    const result = registerAppLifecycleListener((e) => events.push(e));
    expect(result).not.toBeInstanceOf(Promise);
    const unsubscribe = result as () => void;

    setVisibility("hidden");
    setVisibility("visible");
    // Neither transition reached `cb` — the mutation this test guards
    // against is falling back to `registerWebAppLifecycleListener`, which
    // would push `"background"` onto this array.
    expect(events).toStrictEqual([]);
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "visibilitychange",
      expect.anything(),
    );
    // The returned unsubscribe is callable and inert, same contract shape
    // as the real listener's own unsubscribe.
    expect(() => unsubscribe()).not.toThrow();
  });

  it("native: delegates to the native module via a dynamic import, and resolves the SAME callback vocabulary — never reaches the web arm's addEventListener", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const registerNativeAppLifecycleListener = vi.fn(
      async (cb: (e: AppLifecycleEvent) => void) => {
        cb("foreground");
        return vi.fn();
      },
    );
    vi.doMock("../native/appLifecycle", () => ({
      registerNativeAppLifecycleListener,
    }));
    vi.resetModules();
    const { registerAppLifecycleListener } = await import("./appLifecycle");
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");

    const events: AppLifecycleEvent[] = [];
    const result = registerAppLifecycleListener((e) => events.push(e));
    expect(result).toBeInstanceOf(Promise);
    const unsubscribe = await result;

    expect(registerNativeAppLifecycleListener).toHaveBeenCalledOnce();
    expect(events).toStrictEqual(["foreground"]);
    expect(typeof unsubscribe).toBe("function");
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "visibilitychange",
      expect.anything(),
    );
  });
});
