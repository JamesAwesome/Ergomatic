import { afterEach, describe, expect, it, vi } from "vitest";
import { GENERAL_STATUS_UUID } from "../../domain/monitor/pm5/uuids.js";
import { SILENCE_THRESHOLD_MS } from "../monitor/transports/liveness";

// Same `vi.doMock("../platform")` + `vi.resetModules()` idiom as
// `keepAwake.test.ts` (the established adapter precedent this task's own
// brief names) — each test re-imports the module fresh so the platform
// branch is picked at IMPORT time, not baked into a shared instance.

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  delete (window as { __pm5FakeScript__?: unknown }).__pm5FakeScript__;
});

/** A hand-driven schedule — same idiom `liveness.test.ts` uses. */
function manualSchedule() {
  const calls: { ms: number; fire: () => void; cancelled: boolean }[] = [];
  return {
    calls,
    schedule: (fn: () => void, ms: number): (() => void) => {
      const call = { ms, fire: fn, cancelled: false };
      calls.push(call);
      return () => {
        call.cancelled = true;
      };
    },
  };
}

/** Minimal `LivenessDeps` a test doesn't otherwise care about. */
function stubDeps() {
  return {
    now: () => 0,
    schedule: () => () => undefined,
    onSilence: vi.fn(),
    onRecovery: vi.fn(),
  };
}

describe("adapters/monitorTransport web arm", () => {
  it("delegates to resolveDefaultTransport, wrapped in liveness — same underlying scan(), not the raw stub", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    const webTransport = {
      scan: vi.fn(async () => [{ id: "dev-1", name: "PM5 1" }]),
      connect: vi.fn(),
      write: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      disconnect: vi.fn(),
      onDisconnect: vi.fn(() => () => undefined),
    };
    const resolveDefaultTransport = vi.fn(() => webTransport);
    vi.doMock("../monitor/transports/index", () => ({
      resolveDefaultTransport,
    }));
    const capacitorFactory = vi.fn();
    vi.doMock("../monitor/transports/capacitorBle", () => ({
      createCapacitorBleTransport: capacitorFactory,
    }));

    const { defaultTransport } = await import("./monitorTransport");
    const transport = await defaultTransport(stubDeps());

    // NOT `toBe(webTransport)` any more — this is now a `withLiveness`
    // wrapper, a NEW object, over the same inner transport. Proven by
    // delegation instead: calling the wrapper's scan() reaches the raw
    // stub's own scan(), and the wrapper additionally exposes `snapshot`.
    const devices = await transport!.scan();
    expect(devices).toStrictEqual([{ id: "dev-1", name: "PM5 1" }]);
    expect(webTransport.scan).toHaveBeenCalledOnce();
    expect(typeof (transport as { snapshot?: unknown }).snapshot).toBe(
      "function",
    );
    expect(resolveDefaultTransport).toHaveBeenCalledOnce();
    expect(capacitorFactory).not.toHaveBeenCalled();
  });

  it("returns null when resolveDefaultTransport does (no navigator.bluetooth, no fake injected)", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    vi.doMock("../monitor/transports/index", () => ({
      resolveDefaultTransport: () => null,
    }));

    const { defaultTransport } = await import("./monitorTransport");

    // `resolveDefaultTransport`'s own return type is `Transport | null |
    // Promise<...>` — the web arm here returns whatever it returns,
    // unwrapped, so a synchronous `null` stays synchronous rather than
    // being forced through an extra microtask.
    expect(await defaultTransport(stubDeps())).toBeNull();
  });

  it("a Promise<null> from resolveDefaultTransport (a real caller's async arm returning nothing) resolves null, never a wrapped null", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    vi.doMock("../monitor/transports/index", () => ({
      resolveDefaultTransport: () => Promise.resolve(null),
    }));

    const { defaultTransport } = await import("./monitorTransport");

    expect(await defaultTransport(stubDeps())).toBeNull();
  });

  it("THE COMPOSITION ITSELF: a status notification through the wrapped web transport arms the watchdog, and 2500ms of silence trips onSilence — proven through defaultTransport(), not withLiveness in isolation", async () => {
    vi.doMock("../platform", () => ({ isNative: () => false }));
    let statusCb: ((bytes: Uint8Array) => void) | null = null;
    const webTransport = {
      scan: vi.fn(async () => []),
      connect: vi.fn(),
      write: vi.fn(),
      subscribe: vi.fn((char: string, cb: (bytes: Uint8Array) => void) => {
        if (char === GENERAL_STATUS_UUID) statusCb = cb;
        return () => undefined;
      }),
      disconnect: vi.fn(),
      onDisconnect: vi.fn(() => () => undefined),
    };
    vi.doMock("../monitor/transports/index", () => ({
      resolveDefaultTransport: () => webTransport,
    }));
    vi.doMock("../monitor/transports/capacitorBle", () => ({
      createCapacitorBleTransport: vi.fn(),
    }));

    const { defaultTransport } = await import("./monitorTransport");
    const timer = manualSchedule();
    const onSilence = vi.fn();
    const transport = await defaultTransport({
      now: () => 0,
      schedule: timer.schedule,
      onSilence,
      onRecovery: vi.fn(),
    });

    transport!.subscribe(GENERAL_STATUS_UUID, () => {});
    expect(statusCb).not.toBeNull();
    statusCb!(new Uint8Array());

    expect(timer.calls).toHaveLength(1);
    expect(timer.calls[0]!.ms).toBe(SILENCE_THRESHOLD_MS);

    timer.calls[0]!.fire();

    expect(onSilence).toHaveBeenCalledExactlyOnceWith(SILENCE_THRESHOLD_MS);
  });
});

describe("adapters/monitorTransport native arm", () => {
  it("builds the Capacitor BLE transport via a dynamic import, wrapped in liveness — never resolveDefaultTransport", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const nativeTransport = {
      scan: vi.fn(async () => [{ id: "dev-1", name: "PM5 1" }]),
      connect: vi.fn(),
      write: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      disconnect: vi.fn(),
      onDisconnect: vi.fn(() => () => undefined),
    };
    const capacitorFactory = vi.fn(() => nativeTransport);
    vi.doMock("../monitor/transports/capacitorBle", () => ({
      createCapacitorBleTransport: capacitorFactory,
    }));
    const resolveDefaultTransport = vi.fn();
    vi.doMock("../monitor/transports/index", () => ({
      resolveDefaultTransport,
    }));

    const { defaultTransport } = await import("./monitorTransport");
    const transport = await defaultTransport(stubDeps());

    const devices = await transport!.scan();
    expect(devices).toStrictEqual([{ id: "dev-1", name: "PM5 1" }]);
    expect(nativeTransport.scan).toHaveBeenCalledOnce();
    expect(typeof (transport as { snapshot?: unknown }).snapshot).toBe(
      "function",
    );
    expect(capacitorFactory).toHaveBeenCalledOnce();
    expect(resolveDefaultTransport).not.toHaveBeenCalled();
  });

  it("never reaches the web arm's fake-injection seam, even with a fake script sitting on window", async () => {
    // The fake-injection seam (`transports/index.ts`) is a WEB-only door
    // (`e2e/connected.spec.ts` drives it in a Chromium page, never a native
    // shell) — a native build must never read `window.__pm5FakeScript__` at
    // all, so this proves the native branch doesn't even call the module
    // that seam lives in.
    vi.doMock("../platform", () => ({ isNative: () => true }));
    (window as { __pm5FakeScript__?: unknown }).__pm5FakeScript__ = {
      program: { intervals: [] },
      deviceName: "fake",
    };
    const nativeTransport = {
      scan: vi.fn(async () => []),
      connect: vi.fn(),
      write: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      disconnect: vi.fn(),
      onDisconnect: vi.fn(() => () => undefined),
    };
    vi.doMock("../monitor/transports/capacitorBle", () => ({
      createCapacitorBleTransport: vi.fn(() => nativeTransport),
    }));
    const resolveDefaultTransport = vi.fn();
    vi.doMock("../monitor/transports/index", () => ({
      resolveDefaultTransport,
    }));

    const { defaultTransport } = await import("./monitorTransport");
    const transport = await defaultTransport(stubDeps());

    const devices = await transport!.scan();
    expect(devices).toStrictEqual([]);
    expect(nativeTransport.scan).toHaveBeenCalledOnce();
    expect(resolveDefaultTransport).not.toHaveBeenCalled();
  });

  it("THE COMPOSITION ITSELF, native arm: a status notification through the wrapped Capacitor transport arms the watchdog", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    let statusCb: ((bytes: Uint8Array) => void) | null = null;
    const nativeTransport = {
      scan: vi.fn(async () => []),
      connect: vi.fn(),
      write: vi.fn(),
      subscribe: vi.fn((char: string, cb: (bytes: Uint8Array) => void) => {
        if (char === GENERAL_STATUS_UUID) statusCb = cb;
        return () => undefined;
      }),
      disconnect: vi.fn(),
      onDisconnect: vi.fn(() => () => undefined),
    };
    vi.doMock("../monitor/transports/capacitorBle", () => ({
      createCapacitorBleTransport: vi.fn(() => nativeTransport),
    }));
    vi.doMock("../monitor/transports/index", () => ({
      resolveDefaultTransport: vi.fn(),
    }));

    const { defaultTransport } = await import("./monitorTransport");
    const timer = manualSchedule();
    const onSilence = vi.fn();
    const transport = await defaultTransport({
      now: () => 0,
      schedule: timer.schedule,
      onSilence,
      onRecovery: vi.fn(),
    });

    transport!.subscribe(GENERAL_STATUS_UUID, () => {});
    statusCb!(new Uint8Array());
    expect(timer.calls).toHaveLength(1);
    timer.calls[0]!.fire();

    expect(onSilence).toHaveBeenCalledExactlyOnceWith(SILENCE_THRESHOLD_MS);
  });

  it("Phase LL Task 2 (§2 mechanism 3): a structural extension beyond the six core Transport methods (onCharacteristicDegraded) survives the withLiveness wrap unchanged — liveness.ts's own '...inner' spread, proven through the REAL composition, not the decorator in isolation", async () => {
    vi.doMock("../platform", () => ({ isNative: () => true }));
    const registered: Array<(id: string, message: string) => void> = [];
    const nativeTransport = {
      scan: vi.fn(async () => []),
      connect: vi.fn(),
      write: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      disconnect: vi.fn(),
      onDisconnect: vi.fn(() => () => undefined),
      onCharacteristicDegraded: vi.fn(
        (cb: (id: string, message: string) => void) => {
          registered.push(cb);
          return () => undefined;
        },
      ),
    };
    vi.doMock("../monitor/transports/capacitorBle", () => ({
      createCapacitorBleTransport: vi.fn(() => nativeTransport),
    }));
    vi.doMock("../monitor/transports/index", () => ({
      resolveDefaultTransport: vi.fn(),
    }));

    const { defaultTransport } = await import("./monitorTransport");
    const transport = await defaultTransport(stubDeps());

    const extension = transport as unknown as {
      onCharacteristicDegraded(
        cb: (id: string, message: string) => void,
      ): () => void;
    };
    expect(typeof extension.onCharacteristicDegraded).toBe("function");
    const received: Array<[string, string]> = [];
    extension.onCharacteristicDegraded((id, message) =>
      received.push([id, message]),
    );
    // Proves the REGISTRATION reached the inner transport untouched (not
    // a stub the wrapper swallowed) — the wrapper's own object literal
    // never names this method, so without the `...inner` spread this
    // call would be `undefined()` and the test would fail to even reach
    // this line.
    expect(nativeTransport.onCharacteristicDegraded).toHaveBeenCalledOnce();
    expect(registered).toHaveLength(1);
    registered[0]!("0x0032", "boom");
    expect(received).toStrictEqual([["0x0032", "boom"]]);
  });
});
