import { expect, it } from "vitest";
import type {
  DiscoveredMonitor,
  TargetedMonitorDiscoveryRequest,
  Transport,
} from "../../domain/monitor/types.js";
import type { ConnectionAttemptTrace } from "./nfc/connectionAttemptTrace";
import { createTargetedDiscoveryOwner } from "./targetedDiscovery";

const REQUEST: TargetedMonitorDiscoveryRequest = {
  kind: "advertised-name",
  attemptId: "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f",
  exactName: "PM5 432331249 Row",
};

function transportWith(
  scanTarget: (
    request: TargetedMonitorDiscoveryRequest,
    signal: AbortSignal,
  ) => Promise<DiscoveredMonitor[]>,
): Transport & { scanTarget: typeof scanTarget } {
  return {
    scan: async () => [],
    scanTarget,
    connect: async () => undefined,
    write: async () => undefined,
    subscribe: () => () => undefined,
    disconnect: async () => undefined,
    onDisconnect: () => () => undefined,
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

const MONITOR: DiscoveredMonitor = { id: "monitor", name: REQUEST.exactName };

it("keeps a newer operation cancellable when the cancelled predecessor settles late", async () => {
  let epoch = 1;
  const signals: AbortSignal[] = [];
  const rejecters: (() => void)[] = [];
  const transport = transportWith(
    (_request, signal) =>
      new Promise<DiscoveredMonitor[]>((_resolve, reject) => {
        signals.push(signal);
        rejecters.push(() => {
          const error = Object.assign(new Error("aborted"), {
            name: "TargetScanInterruptedError",
            interruptedSignal: signal,
          });
          reject(error);
        });
      }),
  );
  const owner = createTargetedDiscoveryOwner();

  const attemptA = owner.discover({
    transport,
    request: REQUEST,
    attempt: { ordinal: epoch, isSuperseded: () => epoch !== 1 },
    registerLifecycle: () => () => undefined,
  });
  await flush();
  owner.cancel("cancel");
  expect(signals[0]?.aborted).toBe(true);

  epoch = 2;
  const attemptB = owner.discover({
    transport,
    request: { ...REQUEST, attemptId: "9d1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f" },
    attempt: { ordinal: epoch, isSuperseded: () => epoch !== 2 },
    registerLifecycle: () => () => undefined,
  });
  await flush();
  rejecters[0]?.();
  await attemptA;
  expect(signals[1]?.aborted).toBe(false);

  owner.cancel("teardown");
  expect(signals[1]?.aborted).toBe(true);
  rejecters[1]?.();
  await attemptB;
});

it("settles a throwing lifecycle unsubscribe and makes later cancellation a no-op", async () => {
  let completed = 0;
  let signal: AbortSignal | undefined;
  const trace: ConnectionAttemptTrace = {
    record: () => undefined,
    entries: () => [],
    complete: () => {
      completed += 1;
    },
  };
  const owner = createTargetedDiscoveryOwner();

  const result = await owner.discover({
    transport: transportWith(async (_request, seenSignal) => {
      signal = seenSignal;
      return [MONITOR];
    }),
    request: REQUEST,
    trace,
    attempt: { ordinal: 1, isSuperseded: () => false },
    registerLifecycle: () => () => {
      throw Object.assign(new Error("remove failed"), {
        name: "TargetAlreadyConnectedError",
      });
    },
  });

  expect(result).toStrictEqual({
    kind: "failed",
    error: {
      reason: "target-already-connected",
      detail: "End the monitor's current connection, then try again.",
      raw: "remove failed",
    },
  });
  expect(completed).toBe(1);
  owner.cancel("cancel");
  expect(signal?.aborted).toBe(false);
});

it("returns a fresh transport-missing failure for each refused request", async () => {
  const owner = createTargetedDiscoveryOwner();
  let lifecycleRegistrations = 0;
  let targetedScans = 0;
  const transport = transportWith(async () => {
    targetedScans += 1;
    return [MONITOR];
  });
  const refused = {
    transport,
    request: { ...REQUEST, attemptId: "" },
    attempt: { ordinal: 1, isSuperseded: () => false },
    registerLifecycle: () => {
      lifecycleRegistrations += 1;
      return () => undefined;
    },
  };

  const first = await owner.discover(refused);
  if (first.kind !== "failed") throw new Error("invalid request was accepted");
  first.error.detail = "poisoned by a previous caller";

  const second = await owner.discover(refused);
  expect(second).toStrictEqual({
    kind: "failed",
    error: {
      reason: "transport-missing",
      detail: "This device has no Bluetooth transport.",
    },
  });
  expect(lifecycleRegistrations).toBe(0);
  expect(targetedScans).toBe(0);
});

it("refuses a transport without targeted scan before lifecycle or broad scanning", async () => {
  let lifecycleRegistrations = 0;
  let broadScans = 0;
  const transport: Transport = {
    scan: async () => {
      broadScans += 1;
      return [MONITOR];
    },
    connect: async () => undefined,
    write: async () => undefined,
    subscribe: () => () => undefined,
    disconnect: async () => undefined,
    onDisconnect: () => () => undefined,
  };

  const result = await createTargetedDiscoveryOwner().discover({
    transport,
    request: REQUEST,
    attempt: { ordinal: 1, isSuperseded: () => false },
    registerLifecycle: () => {
      lifecycleRegistrations += 1;
      return () => undefined;
    },
  });

  expect(result).toStrictEqual({
    kind: "failed",
    error: {
      reason: "transport-missing",
      detail: "This device has no Bluetooth transport.",
    },
  });
  expect(lifecycleRegistrations).toBe(0);
  expect(broadScans).toBe(0);
});
