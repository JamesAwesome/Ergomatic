// The native plugins are the boundary: the reader, coordinator, lifecycle
// wrapper, transport, hook and exported log below are all production code.
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getQueue } from "@capacitor-community/bluetooth-le/dist/esm/queue";
import { useMonitorSession } from "./useMonitorSession";
import { registerNativeAppLifecycleListener } from "../native/appLifecycle";
import { createNativeNfcReader } from "../native/nfc";
import { runNfcAttempt } from "./nfc/runNfcAttempt";
import { createConnectionAttemptTrace } from "./nfc/connectionAttemptTrace";
import { loadPm5NfcFixture } from "./nfc/fixtures";
import { parseLogExport } from "./eventLog";
import { compileProgram } from "../../domain/monitor/program";
import type { WorkoutType } from "../../domain/types";
import { LIBRARY_WORKOUTS } from "../../server/seed/library/index";
import { buildDraft } from "../session/draft";
import { buildRun } from "../session/engine";
import ConnectionLogSheet from "../workout/connected/ConnectionLogSheet";

const native = vi.hoisted(() => ({
  app: new Map<string, Set<(value?: unknown) => void>>(),
  nfc: new Map<string, Set<(value?: unknown) => void>>(),
  initialize: vi.fn<() => Promise<void>>(),
  isEnabled: vi.fn<() => Promise<boolean>>(),
  held: vi.fn<() => Promise<[]>>(),
  scan: vi.fn<
    (_options: unknown, cb: (value: unknown) => void) => Promise<void>
  >(),
  stop: vi.fn<() => Promise<void>>(),
  picker: vi.fn<() => Promise<{ deviceId: string; name: string }>>(),
  display: vi.fn<() => Promise<void>>(),
  callbacks: [] as ((value: unknown) => void)[],
  pauseRegistration: null as Promise<void> | null,
}));
function fire(
  events: Map<string, Set<(value?: unknown) => void>>,
  name: string,
  value?: unknown,
) {
  for (const cb of events.get(name) ?? []) cb(value);
}
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (name: string, cb: (value?: unknown) => void) => {
      const listeners = native.app.get(name) ?? new Set();
      native.app.set(name, listeners);
      listeners.add(cb);
      if (name === "pause") await native.pauseRegistration;
      return {
        remove: async () => {
          listeners.delete(cb);
        },
      };
    },
  },
}));
vi.mock("@capgo/capacitor-nfc", () => ({
  CapacitorNfc: {
    addListener: async (name: string, cb: (value?: unknown) => void) => {
      const listeners = native.nfc.get(name) ?? new Set();
      native.nfc.set(name, listeners);
      listeners.add(cb);
      return {
        remove: async () => {
          listeners.delete(cb);
        },
      };
    },
    startScanning: async () => undefined,
    stopScanning: async () => undefined,
  },
}));
vi.mock("@capacitor-community/bluetooth-le", () => ({
  BleClient: {
    initialize: native.initialize,
    isEnabled: native.isEnabled,
    getConnectedDevices: native.held,
    requestLEScan: native.scan,
    stopLEScan: native.stop,
    requestDevice: native.picker,
    setDisplayStrings: native.display,
  },
  numbersToDataView: () => undefined,
  toUint8Array: () => undefined,
}));

let createTransport: (typeof import("./transports/capacitorBle"))["createCapacitorBleTransport"];
const attemptId = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const request = {
  kind: "advertised-name" as const,
  attemptId,
  exactName: "PM5 432331249 Row",
};
async function flush() {
  for (let i = 0; i < 50; i += 1) await Promise.resolve();
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  ({ createCapacitorBleTransport: createTransport } =
    await import("./transports/capacitorBle"));
  vi.resetAllMocks();
  native.app.clear();
  native.nfc.clear();
  native.callbacks = [];
  native.pauseRegistration = null;
  native.initialize.mockResolvedValue(undefined);
  native.isEnabled.mockResolvedValue(true);
  native.held.mockResolvedValue([]);
  native.scan.mockImplementation(async (_opts, cb) => {
    native.callbacks.push(cb);
  });
  native.stop.mockResolvedValue(undefined);
  native.picker.mockResolvedValue({
    deviceId: "manual",
    name: "PM5 432331249 Row",
  });
  native.display.mockResolvedValue(undefined);
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
  fire(native.nfc, "nfcEvent", event);
  if (repeat) fire(native.nfc, "nfcEvent", event);
  const outcome = await pending;
  if (outcome.kind !== "target")
    throw new Error("fixture did not produce a target");
  expect(accepted).toHaveBeenCalledOnce();
  expect(outcome.target.advertisingName).toBe("PM5 432331249 Row");
  return {
    trace,
    discovery: { ...request, exactName: outcome.target.advertisingName },
  };
}
async function start(repeat = false) {
  const { trace, discovery } = await readTag(repeat);
  const hook = renderHook(() =>
    useMonitorSession({
      createTransport: () => createTransport(),
      registerAppLifecycleListener: registerNativeAppLifecycleListener,
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = hook.result.current.connect(discovery, trace);
    await flush();
  });
  const entries = () => parseLogExport(hook.result.current.exportLog()).entries;
  return { ...hook, trace, discovery, pending, entries };
}

it.each(["before", "after"])(
  "automatically resumes the same target when foreground arrives %s cleanup",
  async (ordering) => {
    let release!: () => void;
    native.stop.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    const h = await start();
    await act(async () => {
      fire(native.app, "pause");
      await flush();
      if (ordering === "before") fire(native.app, "resume");
      await flush();
    });
    expect(native.scan).toHaveBeenCalledOnce();
    await act(async () => {
      release();
      await flush();
      expect(h.result.current.phase).toBe("picking");
      expect(native.scan).toHaveBeenCalledTimes(ordering === "after" ? 1 : 2);
      if (ordering === "after") {
        fire(native.app, "resume");
        await flush();
      }
    });
    expect(native.scan).toHaveBeenCalledTimes(2);
    expect(native.picker).not.toHaveBeenCalled();
    expect(
      h.entries().filter((e) => e.kind.endsWith(":tag-event")),
    ).toHaveLength(1);
    await act(async () => {
      native.callbacks[1]!({
        device: { deviceId: "resumed" },
        localName: request.exactName,
      });
      await vi.advanceTimersByTimeAsync(1_000);
      await h.pending;
    });
    expect(h.trace.entries()).toContainEqual(
      expect.objectContaining({
        kind: "ble-scan-finished",
        detail: "connect=1 pass=2 outcome=matched superseded=false",
      }),
    );
  },
);

it("does not resume while backgrounded again during cleanup", async () => {
  let release!: () => void;
  native.stop.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  const h = await start();
  await act(async () => {
    fire(native.app, "pause");
    fire(native.app, "resume");
    fire(native.app, "pause");
    await flush();
    release();
    await flush();
  });
  expect(native.scan).toHaveBeenCalledOnce();
  expect(h.result.current.phase).toBe("picking");
  await act(async () => {
    fire(native.app, "resume");
    await flush();
  });
  expect(native.scan).toHaveBeenCalledTimes(2);
  await act(async () => {
    await h.result.current.cancel();
    await h.pending;
  });
});

it.each(["cancel", "teardown"])(
  "%s disarms recovery while waiting for foreground",
  async (source) => {
    const h = await start();
    await act(async () => {
      fire(native.app, "pause");
      await flush();
    });
    expect(h.result.current.phase).toBe("picking");
    await act(async () => {
      if (source === "cancel") await h.result.current.cancel();
      else h.unmount();
      await h.pending;
      fire(native.app, "resume");
      await flush();
    });
    expect(native.scan).toHaveBeenCalledOnce();
    expect(
      [...native.app.values()].every((listeners) => listeners.size === 0),
    ).toBe(true);
  },
);

it("late lifecycle registration after unmount cannot start a scan or leak a return listener", async () => {
  let release!: () => void;
  native.pauseRegistration = new Promise<void>((resolve) => {
    release = resolve;
  });
  const h = await start();
  await act(async () => {
    fire(native.app, "pause");
    h.unmount();
    fire(native.app, "resume");
    release();
    await h.pending;
    fire(native.app, "pause");
    fire(native.app, "resume");
    await flush();
  });
  expect(h.trace.entries()).toContainEqual(
    expect.objectContaining({
      kind: "ble-scan-finished",
      detail: "connect=1 outcome=target-interrupted superseded=true",
    }),
  );
  expect(native.scan).not.toHaveBeenCalled();
  expect(
    [...native.app.values()].every((listeners) => listeners.size === 0),
  ).toBe(true);
});

it("a preamble deadline winning before background is not eligible for recovery", async () => {
  native.initialize.mockImplementation(
    () => new Promise<void>(() => undefined),
  );
  const h = await start();
  await act(async () => {
    // Synchronous timer advance leaves its settled result waiting on microtasks.
    vi.advanceTimersByTime(10_000);
    fire(native.app, "pause");
    fire(native.app, "resume");
    await h.pending;
  });
  expect(h.result.current.error?.reason).toBe("target-interrupted");
  expect(
    h.entries().filter((e) => e.kind.endsWith(":ble-scan-requested")),
  ).toHaveLength(1);
  expect(h.entries().some((e) => e.kind.endsWith(":ble-scan-resumed"))).toBe(
    false,
  );
});

it.each(["resume", "cancel"])(
  "a match winning before background waits for %s without rescanning",
  async (ending) => {
    let release!: () => void;
    native.stop.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const h = await start();
    await act(async () => {
      native.callbacks[0]!({
        device: { deviceId: "matched" },
        localName: request.exactName,
      });
      await vi.advanceTimersByTimeAsync(1_000);
      fire(native.app, "pause");
      release();
      await flush();
    });
    expect(h.result.current.phase).toBe("picking");
    expect(h.result.current.error).toBeNull();
    await act(async () => {
      if (ending === "resume") fire(native.app, "resume");
      else await h.result.current.cancel();
      await h.pending;
    });
    expect(native.scan).toHaveBeenCalledOnce();
    expect(h.trace.entries()).toContainEqual(
      expect.objectContaining({
        kind: "ble-scan-finished",
        detail: "connect=1 outcome=matched superseded=false",
      }),
    );
    expect(h.result.current.phase).toBe(
      ending === "cancel" ? "idle" : "failed",
    );
    // Resume reaches GATT (unmocked here); Cancel must never attempt it.
    expect(h.result.current.error?.reason).toBe(
      ending === "resume" ? "link-failed" : undefined,
    );
  },
);

it.each(["rejected", "deadline"])(
  "background cleanup %s remains terminal after return",
  async (mode) => {
    native.stop.mockImplementation(
      mode === "rejected"
        ? async () => {
            throw new Error("stop failed");
          }
        : () => new Promise<void>(() => undefined),
    );
    const h = await start();
    await act(async () => {
      fire(native.app, "pause");
      fire(native.app, "resume");
      await flush();
      if (mode === "deadline") await vi.advanceTimersByTimeAsync(10_000);
      await h.pending;
    });
    expect(native.scan).toHaveBeenCalledOnce();
    expect(h.result.current.error?.reason).toBe("scan-cleanup-failed");
  },
);

it.each(["background", "cancel", "teardown"])(
  "exports the first %s stop source through the real native pipeline",
  async (cause) => {
    const h = await start();
    await act(async () => {
      if (cause === "background") {
        fire(native.app, "pause");
        await flush();
        await h.result.current.cancel();
      } else if (cause === "cancel") await h.result.current.cancel();
      else h.unmount();
      await h.pending;
    });
    expect(
      h
        .entries()
        .filter((e) => e.kind.endsWith(":ble-scan-abort-requested"))
        .map((e) => e.detail),
    ).toStrictEqual([`connect=1 ${cause}`]);
    expect(h.entries()).toContainEqual(
      expect.objectContaining({
        kind: "nfc-attempt:ble-scan-finished",
        detail: `connect=1 outcome=target-interrupted superseded=${cause !== "background"}`,
      }),
    );
    expect(h.entries()).toContainEqual(
      expect.objectContaining({
        kind: "nfc-attempt:ble-scan-summary",
        detail:
          "connect=1 stage=advertisements outcome=interrupted results=0 valid=0 named=0 matches=0",
      }),
    );
  },
);

it("inactive/active and repeated NFC callbacks leave one live search; foreground is observable without abort", async () => {
  const h = await start(true);
  await act(async () => {
    fire(native.app, "appStateChange", { isActive: false });
    fire(native.app, "appStateChange", { isActive: true });
    fire(native.app, "resume");
    await flush();
  });
  expect(h.result.current.phase).toBe("picking");
  expect(
    h.entries().filter((e) => e.kind.endsWith(":ble-scan-requested")),
  ).toHaveLength(1);
  expect(h.entries().some((e) => e.kind.endsWith(":ble-scan-finished"))).toBe(
    false,
  );
  expect(h.entries()).toContainEqual(
    expect.objectContaining({
      kind: "nfc-attempt:ble-scan-lifecycle",
      detail: "connect=1 foreground",
    }),
  );
  expect(native.stop).not.toHaveBeenCalled();
  await act(async () => {
    await h.result.current.cancel();
    await h.pending;
  });
});

it("a second background interruption ends automatic recovery without a third scan", async () => {
  const h = await start();
  await act(async () => {
    fire(native.app, "pause");
    await flush();
    fire(native.app, "resume");
    await flush();
    fire(native.app, "pause");
    await h.pending;
    fire(native.app, "resume");
    await flush();
  });
  expect(native.scan).toHaveBeenCalledTimes(2);
  expect(
    h
      .entries()
      .filter((e) => e.kind.endsWith(":ble-scan-requested"))
      .map((e) => e.detail),
  ).toStrictEqual(["connect=1", "connect=1 pass=2"]);
  expect(
    h
      .entries()
      .filter((e) => e.kind.endsWith(":ble-scan-abort-requested"))
      .map((e) => e.detail),
  ).toStrictEqual(["connect=1 background", "connect=1 pass=2 background"]);
  expect(h.entries().filter((e) => e.kind.endsWith(":tag-event"))).toHaveLength(
    1,
  );
  expect(h.result.current.error?.reason).toBe("target-interrupted");
});

it.each(["background", "cancel"])(
  "late A cleanup retains A's attribution and B's %s abort owner",
  async (source) => {
    let release!: () => void;
    native.stop.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    const h = await start();
    await act(async () => {
      await h.result.current.cancel();
    });
    let retry!: Promise<void>;
    await act(async () => {
      retry = h.result.current.connect(h.discovery, h.trace);
      await flush();
    });
    await act(async () => {
      release();
      await h.pending;
      await flush();
    });
    expect(h.result.current.phase).toBe("picking");
    expect(h.entries()).toContainEqual(
      expect.objectContaining({
        kind: "nfc-attempt:ble-scan-finished",
        detail: "connect=1 outcome=target-interrupted superseded=true",
      }),
    );
    await act(async () => {
      if (source === "background") fire(native.app, "pause");
      else await h.result.current.cancel();
      await vi.advanceTimersByTimeAsync(20_000);
      if (source === "background") await h.result.current.cancel();
      await retry;
    });
    expect(
      h
        .entries()
        .filter((e) => e.kind.endsWith(":ble-scan-abort-requested"))
        .map((e) => e.detail),
    ).toStrictEqual(["connect=1 cancel", `connect=4 ${source}`]);
  },
);

it("background followed by Cancel and unmount records only the first abort request", async () => {
  let release!: () => void;
  native.stop.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  const h = await start();
  await act(async () => {
    fire(native.app, "pause");
    await h.result.current.cancel();
    h.unmount();
    release();
    await h.pending;
  });
  expect(
    h
      .entries()
      .filter((e) => e.kind.endsWith(":ble-scan-abort-requested"))
      .map((e) => e.detail),
  ).toStrictEqual(["connect=1 background"]);
});

it("registration rejection has a terminal result even though the radio was never requested", async () => {
  const trace = createConnectionAttemptTrace();
  const { result } = renderHook(() =>
    useMonitorSession({
      createTransport: () => createTransport(),
      registerAppLifecycleListener: async () => {
        throw new Error("listener failed");
      },
    }),
  );
  await act(async () => {
    await result.current.connect(request, trace);
  });
  expect(parseLogExport(result.current.exportLog()).entries).toContainEqual(
    expect.objectContaining({
      kind: "nfc-attempt:ble-scan-finished",
      detail: "connect=1 outcome=link-failed superseded=false",
    }),
  );
  expect(native.scan).not.toHaveBeenCalled();
});

it("real failure entries render and copy unchanged through the diagnostic sheet", async () => {
  const h = await start();
  await act(async () => {
    fire(native.app, "pause");
    await flush();
    await h.result.current.cancel();
    await h.pending;
  });
  const raw = h.result.current.exportLog();
  const writeText = vi.fn(async (_text: string) => undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const w = LIBRARY_WORKOUTS.find((w) => w.title === "Filling Low")!;
  const program = compileProgram(
    buildRun(
      buildDraft({
        id: "filling-low",
        title: w.title,
        type: w.type as WorkoutType,
        steps: w.steps,
      }),
      { k2Seconds: 112, k6Seconds: 122 },
      new Date("2026-08-07T09:00:00.000Z"),
    ).phases,
  );
  if ("code" in program) throw new Error(program.code);
  render(
    <ConnectionLogSheet
      deviceCaption="CONNECT"
      elapsedDisplay="—"
      readLog={() => raw}
      program={program}
      opener={{ current: null }}
      onClose={() => undefined}
    />,
  );
  expect(
    screen.getByRole("group", { name: "Connection log entries" }),
  ).toHaveTextContent("BLE-SCAN-ABORT-REQUESTED connect=1 background");
  expect(
    screen.getByRole("group", { name: "Connection log entries" }),
  ).toHaveTextContent("BLE-SCAN-REQUESTED connect=1");
  expect(
    screen.getByRole("group", { name: "Connection log entries" }),
  ).toHaveTextContent(
    "BLE-SCAN-FINISHED connect=1 outcome=target-interrupted superseded=false",
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "COPY LOG" }));
  });
  expect(writeText).toHaveBeenCalledWith(raw);
});

function scan() {
  const trace = createConnectionAttemptTrace();
  const ac = new AbortController();
  const transport = createTransport();
  const pending = transport.scanTarget(request, ac.signal, trace);
  void pending.catch(() => undefined);
  return { trace, ac, transport, pending };
}
function details(
  trace: ReturnType<typeof createConnectionAttemptTrace>,
  kind: string,
) {
  return trace
    .entries()
    .filter((e) => e.kind === kind)
    .map((e) => e.detail);
}
it("summarizes callback observations without exposing identities or counting duplicates as devices", async () => {
  const h = scan();
  await flush();
  const cb = native.callbacks[0]!;
  cb(null);
  cb({ device: { deviceId: "absent" } });
  cb({ device: { deviceId: "other" }, localName: "private-name" });
  cb({ device: { deviceId: "exact" }, localName: request.exactName });
  cb({ device: { deviceId: "exact" }, localName: request.exactName });
  await vi.advanceTimersByTimeAsync(1_000);
  await h.pending;
  cb({ device: { deviceId: "late" }, localName: request.exactName });
  expect(details(h.trace, "ble-scan-summary")).toStrictEqual([
    "stage=collision-window outcome=matched results=5 valid=4 named=3 matches=1",
  ]);
});
it.each([
  "initialize",
  "enabled",
  "held-devices",
  "scan-start",
  "advertisements",
])("reports a deadline at %s", async (stage) => {
  const never = () => new Promise<never>(() => undefined);
  if (stage === "initialize") native.initialize.mockImplementation(never);
  if (stage === "enabled") native.isEnabled.mockImplementation(never);
  if (stage === "held-devices") native.held.mockImplementation(never);
  if (stage === "scan-start") native.scan.mockImplementation(never);
  const h = scan();
  await flush();
  await vi.advanceTimersByTimeAsync(10_000);
  await expect(h.pending).rejects.toBeInstanceOf(Error);
  expect(details(h.trace, "ble-scan-summary")).toStrictEqual([
    `stage=${stage} outcome=${stage === "scan-start" || stage === "advertisements" ? "not-advertising" : "interrupted"} results=0 valid=0 named=0 matches=0`,
  ]);
});
it("records an abort before scan entry without any radio work", async () => {
  const trace = createConnectionAttemptTrace();
  const ac = new AbortController();
  ac.abort();
  await expect(
    createTransport().scanTarget(request, ac.signal, trace),
  ).rejects.toMatchObject({ name: "TargetScanInterruptedError" });
  expect(details(trace, "ble-scan-summary")).toStrictEqual([
    "stage=queue outcome=interrupted results=0 valid=0 named=0 matches=0",
  ]);
  expect(native.initialize).not.toHaveBeenCalled();
});
// Use the installed vendor queue; independent resolved scan/stop mocks would
// allow cleanup to overtake a pending start, which BleClient cannot do.
function holdVendorStart() {
  const queue = getQueue(true);
  const calls: string[] = [];
  let release!: () => void;
  native.scan.mockImplementation(() =>
    queue(async () => {
      calls.push("start-enter");
      await new Promise<void>((r) => {
        release = r;
      });
      calls.push("start-resolve");
    }),
  );
  native.stop.mockImplementation(() =>
    queue(async () => {
      calls.push("stop-enter");
    }),
  );
  return { calls, release: () => release() };
}
it.each(["release", "cleanup-deadline"])(
  "vendor queue preserves late start ordering through %s",
  async (mode) => {
    const vendor = holdVendorStart();
    const h = await start();
    await act(async () => {
      fire(native.app, "pause");
      await flush();
    });
    expect(vendor.calls).toStrictEqual(["start-enter"]);
    expect(details(h.trace, "ble-scan-summary")).toStrictEqual([
      "connect=1 stage=scan-start outcome=interrupted results=0 valid=0 named=0 matches=0",
    ]);
    expect(details(h.trace, "ble-scan-finished")).toStrictEqual([]);
    if (mode === "cleanup-deadline") {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
        await h.pending;
      });
    }
    expect(h.result.current.error?.reason).toBe(
      mode === "cleanup-deadline" ? "scan-cleanup-failed" : undefined,
    );
    expect(vendor.calls).toStrictEqual(["start-enter"]);
    await act(async () => {
      vendor.release();
      await flush();
      if (mode === "release") await h.result.current.cancel();
      await h.pending;
      await flush();
    });
    expect(vendor.calls).toStrictEqual([
      "start-enter",
      "start-resolve",
      "stop-enter",
    ]);
    expect(details(h.trace, "ble-scan-started")).toStrictEqual([]);
    expect(details(h.trace, "ble-scan-started-late")).toStrictEqual([
      "connect=1",
    ]);
    expect(details(h.trace, "ble-scan-finished")).toStrictEqual([
      `connect=1 outcome=${mode === "release" ? "target-interrupted" : "scan-cleanup-failed"} superseded=false`,
    ]);
  },
);

it("early match keeps collision-window stage when start acknowledges", async () => {
  let release!: () => void;
  native.scan.mockImplementation((_o, cb) => {
    cb({ device: { deviceId: "early" }, localName: request.exactName });
    return new Promise<void>((r) => {
      release = r;
    });
  });
  const h = scan();
  await flush();
  release();
  await flush();
  await vi.advanceTimersByTimeAsync(1_000);
  await h.pending;
  expect(details(h.trace, "ble-scan-summary")).toStrictEqual([
    "stage=collision-window outcome=matched results=1 valid=1 named=1 matches=1",
  ]);
});
it.each(["rejected", "deadline"])(
  "cleanup %s overrides a matched decision in the hook's final result",
  async (mode) => {
    native.stop.mockImplementation(
      mode === "rejected"
        ? async () => {
            throw new Error("private-address");
          }
        : () => new Promise<void>(() => undefined),
    );
    const h = await start();
    await act(async () => {
      native.callbacks[0]!({
        device: { deviceId: "d" },
        localName: request.exactName,
      });
      await vi.advanceTimersByTimeAsync(mode === "rejected" ? 1_000 : 11_000);
      await h.pending;
    });
    expect(h.entries()).toContainEqual(
      expect.objectContaining({
        kind: "nfc-attempt:ble-scan-finished",
        detail: "connect=1 outcome=scan-cleanup-failed superseded=false",
      }),
    );
    expect(
      h.entries().find((e) => e.kind.endsWith(":ble-scan-summary"))?.detail,
    ).toContain("outcome=matched");
    expect(h.result.current.exportLog()).not.toContain("private-address");
    const second = scan();
    await expect(second.pending).rejects.toMatchObject({
      name: "ScanCleanupFailedError",
    });
    await expect(createTransport().scan()).rejects.toMatchObject({
      name: "ScanCleanupFailedError",
    });
    expect(native.picker).not.toHaveBeenCalled();
    expect(details(second.trace, "ble-scan-summary")).toStrictEqual([
      "stage=queue outcome=cleanup-failed results=0 valid=0 named=0 matches=0",
    ]);
  },
);
it("unknown native errors retain no raw error identity in the diagnostic summary", async () => {
  native.held.mockRejectedValue(
    Object.assign(new Error("private-message"), { name: "private-name" }),
  );
  const h = scan();
  await expect(h.pending).rejects.toBeInstanceOf(Error);
  expect(details(h.trace, "ble-scan-summary")).toStrictEqual([
    "stage=held-devices outcome=other-error results=0 valid=0 named=0 matches=0",
  ]);
  expect(JSON.stringify(h.trace.entries())).not.toContain("private-");
});
it("omitting the trace preserves the same aborted outcome", async () => {
  const ac = new AbortController();
  const pending = createTransport().scanTarget(request, ac.signal);
  void pending.catch(() => undefined);
  await flush();
  ac.abort();
  await expect(pending).rejects.toMatchObject({
    name: "TargetScanInterruptedError",
  });
});

it.each([undefined, "", "other"])(
  "counts localName=%s without retaining it",
  async (localName) => {
    const h = scan();
    await flush();
    native.callbacks[0]!({ device: { deviceId: "private-device" }, localName });
    h.ac.abort();
    await expect(h.pending).rejects.toBeInstanceOf(Error);
    expect(details(h.trace, "ble-scan-summary")).toStrictEqual([
      `stage=advertisements outcome=interrupted results=1 valid=1 named=${localName ? 1 : 0} matches=0`,
    ]);
    expect(JSON.stringify(h.trace.entries())).not.toContain("private-device");
  },
);
it.each([undefined, "", "wrong"])(
  "invalid attemptId=%s records rejection before native initialization",
  async (attemptId) => {
    const trace = createConnectionAttemptTrace();
    await expect(
      createTransport().scanTarget(
        { ...request, attemptId } as typeof request,
        new AbortController().signal,
        trace,
      ),
    ).rejects.toMatchObject({ name: "TargetedRequestInvalidError" });
    expect(details(trace, "ble-scan-summary")).toStrictEqual([
      "stage=queue outcome=invalid-request results=0 valid=0 named=0 matches=0",
    ]);
    expect(native.initialize).not.toHaveBeenCalled();
  },
);
it("queue deadline reports queue while its predecessor owns cleanup", async () => {
  let release!: () => void;
  native.stop.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );
  const ac = new AbortController();
  const predecessor = createTransport({ targetDeadlineMs: 20_000 }).scanTarget(
    request,
    ac.signal,
  );
  void predecessor.catch(() => undefined);
  await flush();
  ac.abort();
  await flush();
  const b = scan();
  await flush();
  await vi.advanceTimersByTimeAsync(10_000);
  await expect(b.pending).rejects.toMatchObject({
    name: "TargetScanInterruptedError",
  });
  expect(details(b.trace, "ble-scan-summary")).toStrictEqual([
    "stage=queue outcome=interrupted results=0 valid=0 named=0 matches=0",
  ]);
  expect(native.scan).toHaveBeenCalledOnce();
  release();
  await expect(predecessor).rejects.toMatchObject({
    name: "TargetScanInterruptedError",
  });
});

it("successful scan emits its final result before the later GATT phase", async () => {
  // No GATT plugin is mocked here: the assertion stops at the scan boundary.
  const h = await start();
  await act(async () => {
    native.callbacks[0]!({
      device: { deviceId: "one" },
      localName: request.exactName,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await h.pending;
  });
  expect(h.trace.entries()).toContainEqual(
    expect.objectContaining({
      kind: "ble-scan-finished",
      detail: "connect=1 outcome=matched superseded=false",
    }),
  );
});
it("hook without a trace recovers once and then keeps native background cancellation", async () => {
  const h = renderHook(() =>
    useMonitorSession({
      createTransport: () => createTransport(),
      registerAppLifecycleListener: registerNativeAppLifecycleListener,
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = h.result.current.connect(request);
    await flush();
    fire(native.app, "pause");
    await flush();
    fire(native.app, "resume");
    await flush();
    fire(native.app, "pause");
    await pending;
  });
  expect(h.result.current.error?.reason).toBe("target-interrupted");
  expect(
    parseLogExport(h.result.current.exportLog()).entries.some((e) =>
      e.kind.startsWith("nfc-attempt:"),
    ),
  ).toBe(false);
});

it("a pending shared initialization makes consecutive retries time out before scanning", async () => {
  native.initialize.mockImplementation(
    () => new Promise<void>(() => undefined),
  );
  const h = await start();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
    await h.pending;
  });
  expect(h.result.current.error?.reason).toBe("target-interrupted");
  let retry!: Promise<void>;
  await act(async () => {
    retry = h.result.current.connect(h.discovery, h.trace);
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    await retry;
  });
  expect(h.result.current.error?.reason).toBe("target-interrupted");
  expect(native.initialize).toHaveBeenCalledOnce();
  expect(native.scan).not.toHaveBeenCalled();
  expect(
    h
      .entries()
      .filter((e) => e.kind.endsWith(":ble-scan-timed-out"))
      .map((e) => e.detail),
  ).toStrictEqual(["connect=1 preamble", "connect=2 preamble"]);
  expect(
    h
      .entries()
      .filter((e) => e.kind.endsWith(":ble-scan-summary"))
      .map((e) => e.detail),
  ).toStrictEqual([
    "connect=1 stage=initialize outcome=interrupted results=0 valid=0 named=0 matches=0",
    "connect=2 stage=initialize outcome=interrupted results=0 valid=0 named=0 matches=0",
  ]);
  expect(
    h.entries().some((e) => e.kind.endsWith(":ble-scan-abort-requested")),
  ).toBe(false);
});

it("interrupted targeted discovery permits manual discovery on a new transport without reinitializing", async () => {
  const h = await start();
  await act(async () => {
    fire(native.app, "pause");
    await flush();
    await h.result.current.cancel();
    await h.pending;
  });
  const manual = createTransport();
  await expect(manual.scan()).resolves.toStrictEqual([
    { id: "manual", name: "PM5 432331249 Row" },
  ]);
  expect(native.picker).toHaveBeenCalledOnce();
  expect(native.initialize).toHaveBeenCalledOnce();
  expect(
    h.entries().find((e) => e.kind.endsWith(":ble-scan-finished"))?.detail,
  ).toBe("connect=1 outcome=target-interrupted superseded=false");
});

it.each([
  undefined,
  "",
  "private-name",
  "constructor",
  "__proto__",
  "toString",
])(
  "native rejection with name=%s has closed summary and final outcome vocabulary",
  async (name) => {
    native.held.mockRejectedValue(
      Object.assign(new Error("private-message"), { name }),
    );
    const h = await start();
    await act(async () => {
      await h.pending;
    });
    expect(h.result.current.phase).toBe("failed");
    expect(details(h.trace, "ble-scan-summary")).toStrictEqual([
      "connect=1 stage=held-devices outcome=other-error results=0 valid=0 named=0 matches=0",
    ]);
    expect(
      h
        .entries()
        .filter((e) => e.kind.endsWith(":ble-scan-finished"))
        .map((e) => e.detail),
    ).toStrictEqual(["connect=1 outcome=link-failed superseded=false"]);
    expect(h.result.current.exportLog()).not.toContain("private-");
  },
);
