// Research-only characterization of the unchanged production pipeline.
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMonitorSession } from "./useMonitorSession";
import { createCapacitorBleTransport } from "./transports/capacitorBle";
import { registerNativeAppLifecycleListener } from "../native/appLifecycle";
import { createNativeNfcReader } from "../native/nfc";
import { runNfcAttempt } from "./nfc/runNfcAttempt";
import { createConnectionAttemptTrace } from "./nfc/connectionAttemptTrace";
import { loadPm5NfcFixture } from "./nfc/fixtures";
import { parseLogExport } from "./eventLog";

const native = vi.hoisted(() => ({
  app: new Map<string, (...args: unknown[]) => void>(),
  nfc: new Map<string, (value: unknown) => void>(),
  stops: 0,
  scans: 0,
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (name: string, cb: (...args: unknown[]) => void) => {
      native.app.set(name, cb);
      return { remove: async () => { native.app.delete(name); } };
    },
  },
}));
vi.mock("@capgo/capacitor-nfc", () => ({
  CapacitorNfc: {
    addListener: async (name: string, cb: (value: unknown) => void) => {
      native.nfc.set(name, cb);
      return { remove: async () => { native.nfc.delete(name); } };
    },
    startScanning: async () => undefined,
    stopScanning: async () => undefined,
  },
}));
vi.mock("@capacitor-community/bluetooth-le", () => ({
  BleClient: {
    initialize: async () => undefined,
    isEnabled: async () => true,
    getConnectedDevices: async () => [],
    requestLEScan: async () => { native.scans += 1; },
    stopLEScan: async () => { native.stops += 1; },
  },
  numbersToDataView: () => undefined,
  toUint8Array: () => undefined,
}));

const attemptId = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
async function flush() {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
}
beforeEach(() => {
  vi.useFakeTimers();
  native.app.clear();
  native.nfc.clear();
  native.scans = 0;
  native.stops = 0;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function readTag(repeat = false) {
  const trace = createConnectionAttemptTrace();
  const accepted = vi.fn();
  const pending = runNfcAttempt({
    attemptId,
    reader: createNativeNfcReader(),
    trace,
    signal: new AbortController().signal,
    haptic: async () => undefined,
    paint: async () => undefined,
    onAccepted: accepted,
  });
  await flush();
  const event = {
    attemptId,
    type: "ndef",
    tag: { ndefMessage: loadPm5NfcFixture().records },
  };
  native.nfc.get("nfcEvent")!(event);
  if (repeat) native.nfc.get("nfcEvent")!(event);
  const outcome = await pending;
  expect(outcome.kind).toBe("target");
  expect(accepted).toHaveBeenCalledOnce();
  expect(native.nfc.size).toBe(0);
  return trace;
}

it.each(["inactive", "background", "cancel", "unmount", "timeout", "retry", "repeat-tag"])(
  "characterizes %s through the native wrappers, real scan and hook",
  async (scenario) => {
    const trace = await readTag(scenario === "repeat-tag");
    const request = { kind: "advertised-name" as const, attemptId, exactName: "PM5 432331249 Row" };
    const { result, unmount } = renderHook(() => useMonitorSession({
      createTransport: () => createCapacitorBleTransport(),
      registerAppLifecycleListener: registerNativeAppLifecycleListener,
    }));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.connect(request, trace); await flush(); });
    expect(native.scans).toBe(1);
    expect(result.current.phase).toBe("picking");
    if (scenario === "inactive" || scenario === "repeat-tag") {
      await act(async () => {
        native.app.get("appStateChange")?.({ isActive: false });
        native.app.get("appStateChange")?.({ isActive: true });
        await flush();
      });
      expect(result.current.phase).toBe("picking");
      expect(native.stops).toBe(0);
      await act(async () => { await result.current.cancel(); await pending; });
    } else if (scenario === "cancel") {
      await act(async () => { await result.current.cancel(); await pending; });
      expect(result.current.phase).toBe("idle");
    } else if (scenario === "unmount") {
      unmount();
      await pending;
    } else if (scenario === "timeout") {
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); await pending; });
      expect(result.current.error?.reason).toBe("target-not-advertising");
    } else {
      await act(async () => { native.app.get("pause")!(); await pending; });
      expect(result.current.error?.reason).toBe("target-interrupted");
      expect(result.current.error?.raw).toBe("The targeted scan was aborted.");
      if (scenario === "retry") {
        await act(async () => { pending = result.current.connect(request, trace); await flush(); });
        await act(async () => { native.app.get("pause")!(); await pending; });
        expect(native.scans).toBe(2);
        expect(result.current.error?.reason).toBe("target-interrupted");
      }
    }
    expect(native.stops).toBe(scenario === "retry" ? 2 : 1);
    const exported = parseLogExport(result.current.exportLog());
    process.stdout.write(JSON.stringify({
      scenario,
      phase: result.current.phase,
      reason: result.current.error?.reason ?? null,
      entries: exported.entries.map(({ kind, detail }) => [kind, detail]),
    }) + "\n");
  },
);
