import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Same `vi.doMock("../platform")` idiom as adapters/auth.test.tsx: each test
// re-imports the module fresh (vi.resetModules in beforeEach) so the web
// arm's module-level `webWakeLock` variable never leaks between tests.

function defineWakeLock(value: unknown) {
  Object.defineProperty(navigator, "wakeLock", { value, configurable: true });
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

// Flushes the microtask queue enough times for requestWebWakeLock's own
// `await` chain (the mocked `request` promise, then the assignment) to
// settle before an assertion reads `request`'s call count.
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

// `document` is a single jsdom instance shared by every test in this file
// (vi.resetModules only clears vitest's MODULE registry, it can't detach a
// listener a PRIOR test's module instance already registered against the
// real, shared `document`) — a test that calls keepAwakeOn without a
// matching keepAwakeOff would otherwise leave a live "visibilitychange"
// listener that fires against a LATER test's mocks and inflates its call
// counts (caught by this file's own self-mutation pass: without this
// tracking, "stops re-acquiring..." saw 4 calls instead of 1). Every
// listener this file's tests register is tracked and force-removed in
// afterEach, regardless of whether the test under test ever called
// keepAwakeOff itself.
let trackedListeners: [string, EventListenerOrEventListenerObject][] = [];

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  // Baseline: no Wake Lock API at all — jsdom doesn't implement one, so this
  // mirrors reality unless a test opts in via defineWakeLock.
  defineWakeLock(undefined);
  Object.defineProperty(document, "visibilityState", {
    value: "visible",
    configurable: true,
  });
  trackedListeners = [];
  vi.spyOn(document, "addEventListener").mockImplementation(
    (type, handler, options) => {
      trackedListeners.push([
        type,
        handler as EventListenerOrEventListenerObject,
      ]);
      EventTarget.prototype.addEventListener.call(
        document,
        type,
        handler,
        options,
      );
    },
  );
});

afterEach(() => {
  defineWakeLock(undefined);
  for (const [type, handler] of trackedListeners) {
    document.removeEventListener(type, handler);
  }
});

describe("adapters/keepAwake web arm", () => {
  it("is a silent no-op when the Wake Lock API is absent", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const { keepAwakeOn, keepAwakeOff } = await import("./keepAwake");
    await expect(keepAwakeOn()).resolves.toBeUndefined();
    await expect(keepAwakeOff()).resolves.toBeUndefined();
  });

  it("requests a screen wake lock when the API is present", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const sentinel = { release: vi.fn(async () => {}) };
    const request = vi.fn(async () => sentinel);
    defineWakeLock({ request });
    const { keepAwakeOn } = await import("./keepAwake");

    await keepAwakeOn();

    expect(request).toHaveBeenCalledWith("screen");
  });

  it("releases the acquired sentinel on keepAwakeOff", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const sentinel = { release: vi.fn(async () => {}) };
    defineWakeLock({ request: vi.fn(async () => sentinel) });
    const { keepAwakeOn, keepAwakeOff } = await import("./keepAwake");

    await keepAwakeOn();
    await keepAwakeOff();

    expect(sentinel.release).toHaveBeenCalledOnce();
  });

  it("is a no-op on keepAwakeOff when no lock was ever acquired", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const { keepAwakeOff } = await import("./keepAwake");

    await expect(keepAwakeOff()).resolves.toBeUndefined();
  });

  it("swallows a request rejection (best-effort) rather than throwing", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    defineWakeLock({
      request: vi.fn(async () => {
        throw new Error("denied");
      }),
    });
    const { keepAwakeOn } = await import("./keepAwake");

    await expect(keepAwakeOn()).resolves.toBeUndefined();
  });

  it("swallows a release rejection (best-effort) rather than throwing", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const sentinel = {
      release: vi.fn(async () => {
        throw new Error("already released");
      }),
    };
    defineWakeLock({ request: vi.fn(async () => sentinel) });
    const { keepAwakeOn, keepAwakeOff } = await import("./keepAwake");
    await keepAwakeOn();

    await expect(keepAwakeOff()).resolves.toBeUndefined();
  });

  it("re-acquires the lock once the document becomes visible again", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const sentinel = { release: vi.fn(async () => {}) };
    const request = vi.fn(async () => sentinel);
    defineWakeLock({ request });
    const { keepAwakeOn } = await import("./keepAwake");
    await keepAwakeOn();
    expect(request).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    expect(request).toHaveBeenCalledTimes(1); // going hidden never re-requests

    setVisibility("visible");
    await flushMicrotasks();

    expect(request).toHaveBeenCalledTimes(2);
  });

  it("stops re-acquiring once keepAwakeOff has removed the listener", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const sentinel = { release: vi.fn(async () => {}) };
    const request = vi.fn(async () => sentinel);
    defineWakeLock({ request });
    const { keepAwakeOn, keepAwakeOff } = await import("./keepAwake");
    await keepAwakeOn();
    await keepAwakeOff();
    expect(request).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    setVisibility("visible");
    await flushMicrotasks();

    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("adapters/keepAwake native arm", () => {
  it("calls the native plugin's keepAwake() via the adapter", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const nativeKeepAwakeOn = vi.fn(async () => {});
    const nativeKeepAwakeOff = vi.fn(async () => {});
    vi.doMock("../native/keepAwake", () => ({
      nativeKeepAwakeOn,
      nativeKeepAwakeOff,
    }));
    const { keepAwakeOn } = await import("./keepAwake");

    await keepAwakeOn();

    expect(nativeKeepAwakeOn).toHaveBeenCalledOnce();
    expect(nativeKeepAwakeOff).not.toHaveBeenCalled();
  });

  it("calls the native plugin's allowSleep() via the adapter", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const nativeKeepAwakeOn = vi.fn(async () => {});
    const nativeKeepAwakeOff = vi.fn(async () => {});
    vi.doMock("../native/keepAwake", () => ({
      nativeKeepAwakeOn,
      nativeKeepAwakeOff,
    }));
    const { keepAwakeOff } = await import("./keepAwake");

    await keepAwakeOff();

    expect(nativeKeepAwakeOff).toHaveBeenCalledOnce();
  });

  it("never touches the web arm's visibilitychange listener on the native path", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    vi.doMock("../native/keepAwake", () => ({
      nativeKeepAwakeOn: vi.fn(async () => {}),
      nativeKeepAwakeOff: vi.fn(async () => {}),
    }));
    const addSpy = vi.spyOn(document, "addEventListener");
    const { keepAwakeOn } = await import("./keepAwake");

    await keepAwakeOn();

    expect(addSpy).not.toHaveBeenCalledWith(
      "visibilitychange",
      expect.anything(),
    );
  });
});
