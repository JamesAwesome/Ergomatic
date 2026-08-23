/// <reference types="node" />
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  CONTROL_SERVICE_UUID,
  DEVICE_INFO_SERVICE_UUID,
  END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
  END_OF_WORKOUT_SUMMARY_UUID,
  LOGGED_WORKOUT_UUID,
  RECEIVE_CHARACTERISTIC_UUID,
  ROWING_SERVICE_UUID,
} from "../../../domain/monitor/pm5/uuids.js";
import { createWebBluetoothTransport } from "./webBluetooth";

// M-2 (final-review): same contract, same reasoning as
// `capacitorBle.test.ts`'s own header comment — `Transport.onDisconnect`
// (domain/monitor/types.ts:120-125) must never fire for a caller-initiated
// `disconnect()`. `webBluetooth.ts` is coverage-excluded (no Chromium-with-
// a-real-PM5 exists in CI), but the GUARD this file added is pinnable
// against a jsdom-safe fake `navigator.bluetooth`/`BluetoothDevice` that
// fires `gattserverdisconnected` the same way the real spec does — this
// proves `webBluetooth.ts`'s own logic, not the browser's.
//
// Phase 7A-fix Task 4 adds the retro-tests for the three fixes made LIVE at
// the erg in this file (interface-notes.md §18's "also fixed live" list),
// which shipped with no test of their own: the discovery filter's shape, the
// characteristic cache cleared on connect, and the single
// `gattserverdisconnected` listener. The fake GATT layer below therefore
// models the ONE browser behaviour that turned the middle one into a
// hardware-only bug — Chrome invalidates every characteristic object when
// the link drops, so a handle cached across a reconnect throws
// `InvalidStateError` on use.

class FakeCharacteristic extends EventTarget {
  valid = true;
  readonly writes: Uint8Array[] = [];

  constructor(readonly uuid: string) {
    super();
  }

  private assertValid(): void {
    if (this.valid) return;
    // Chrome's own wording, which is what the laptop session saw on every
    // post-reconnect write (interface-notes.md §18).
    throw new Error(
      `InvalidStateError: Characteristic with UUID ${this.uuid} is no longer valid. Remember to retrieve the characteristic again after reconnecting.`,
    );
  }

  writeValueWithoutResponse = vi.fn((value: Uint8Array): Promise<void> => {
    this.assertValid();
    this.writes.push(value);
    return Promise.resolve();
  });

  writeValue = vi.fn((value: Uint8Array): Promise<void> => {
    this.assertValid();
    this.writes.push(value);
    return Promise.resolve();
  });

  startNotifications = vi.fn((): Promise<FakeCharacteristic> => {
    this.assertValid();
    return Promise.resolve(this);
  });

  stopNotifications = vi.fn((): Promise<FakeCharacteristic> => {
    return Promise.resolve(this);
  });
}

class FakeGattServer {
  device!: FakeDevice;
  connected = false;
  /** Every characteristic handed out on the CURRENT connection — all of
   *  them die together when the link goes (`invalidateIssued`). */
  issued: FakeCharacteristic[] = [];

  connect = vi.fn((): Promise<FakeGattServer> => {
    this.connected = true;
    return Promise.resolve(this);
  });

  disconnect = vi.fn(() => {
    this.connected = false;
    this.invalidateIssued();
    this.device.fireGattServerDisconnected();
  });

  invalidateIssued(): void {
    for (const characteristic of this.issued) characteristic.valid = false;
    this.issued = [];
  }

  getPrimaryService = vi.fn((service: string) => {
    if (!this.connected) {
      throw new Error(
        `FakeGattServer: getPrimaryService(${service}) while disconnected`,
      );
    }
    return Promise.resolve({
      getCharacteristic: (id: string): Promise<FakeCharacteristic> => {
        const characteristic = new FakeCharacteristic(id);
        this.issued.push(characteristic);
        return Promise.resolve(characteristic);
      },
    });
  });
}

class FakeDevice extends EventTarget {
  readonly id: string;
  readonly name: string;
  readonly gatt: FakeGattServer;
  /** Every add/remove this device has been asked for, in order. A real
   *  `EventTarget` DEDUPES an identical (type, listener, capture) triple, so
   *  a behavioural "only one callback fired" assertion cannot by itself
   *  prove `webBluetooth.ts` removes before it adds — this ledger is what
   *  makes the idempotence provable independently of that dedupe. */
  readonly listenerLedger: { op: "add" | "remove"; type: string }[] = [];

  constructor(id: string, name: string) {
    super();
    this.id = id;
    this.name = name;
    this.gatt = new FakeGattServer();
    this.gatt.device = this;
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.listenerLedger.push({ op: "add", type });
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    this.listenerLedger.push({ op: "remove", type });
    super.removeEventListener(type, listener, options);
  }

  /** The add/remove sequence for `type`, in order. */
  ledgerFor(type: string): string[] {
    return this.listenerLedger.filter((e) => e.type === type).map((e) => e.op);
  }

  fireGattServerDisconnected(): void {
    this.dispatchEvent(new Event("gattserverdisconnected"));
  }

  /** A real radio drop: the handles die first, then the event fires — the
   *  order Chrome uses, and the reason a cached handle is already dead by
   *  the time anything reacts to the disconnect. */
  dropLink(): void {
    this.gatt.connected = false;
    this.gatt.invalidateIssued();
    this.fireGattServerDisconnected();
  }
}

function installFakeBluetooth(device: FakeDevice): {
  requestDevice: ReturnType<typeof vi.fn>;
} {
  const bluetooth = { requestDevice: vi.fn().mockResolvedValue(device) };
  Object.assign(globalThis.navigator, { bluetooth });
  return bluetooth;
}

afterEach(() => {
  Object.assign(globalThis.navigator, { bluetooth: undefined });
});

describe("createWebBluetoothTransport: onDisconnect contract (M-2)", () => {
  it("a caller-initiated disconnect() does NOT fire onDisconnect", async () => {
    const device = new FakeDevice("pm5-1", "PM5 111");
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();
    const drops: string[] = [];
    transport.onDisconnect((reason) => drops.push(reason));

    await transport.scan();
    await transport.connect(device.id);
    await transport.disconnect();

    expect(drops).toStrictEqual([]);
  });

  it("an UNEXPECTED gattserverdisconnected (nothing called disconnect() first) still fires onDisconnect", async () => {
    const device = new FakeDevice("pm5-2", "PM5 222");
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();
    const drops: string[] = [];
    transport.onDisconnect((reason) => drops.push(reason));

    await transport.scan();
    await transport.connect(device.id);
    device.fireGattServerDisconnected(); // a real radio drop, not caller-initiated

    expect(drops).toHaveLength(1);
    expect(drops[0]).toContain("gattserverdisconnected");
  });

  it("a RECONNECT clears the guard — a caller-initiated disconnect from the PRIOR connection can never suppress the new one's genuine drop", async () => {
    const device = new FakeDevice("pm5-3", "PM5 333");
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();
    const drops: string[] = [];
    transport.onDisconnect((reason) => drops.push(reason));

    await transport.scan();
    await transport.connect(device.id);
    await transport.disconnect(); // arms and consumes the guard once
    await transport.connect(device.id); // reconnect — must reset the guard
    device.fireGattServerDisconnected(); // a genuine drop on the NEW connection

    expect(drops).toHaveLength(1);
  });
});

describe("createWebBluetoothTransport: the discovery filter (fixed live at the erg)", () => {
  it("filters on the device-info service OR the PM5 name prefix — and never on the rowing service, which is not advertised", async () => {
    const device = new FakeDevice("pm5-4", "PM5 444");
    const bluetooth = installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();

    await transport.scan();

    const options = bluetooth.requestDevice.mock.calls[0]![0] as {
      filters: Array<{ services?: string[]; namePrefix?: string }>;
      optionalServices: string[];
    };
    // Both filters, because the observation cannot say which one matched —
    // filters are OR'd, and the name prefix survives a firmware revision
    // that changes the advertising set.
    expect(options.filters).toStrictEqual([
      { services: [DEVICE_INFO_SERVICE_UUID] },
      { namePrefix: "PM5" },
    ]);
    // The regression this exists to prevent (interface-notes.md §18):
    // filtering on the rowing service left Chrome's picker scanning forever
    // against a real PM5, because 0x0030 is not in the advertisement — it
    // only becomes visible after the GATT connection.
    expect(
      options.filters.some((f) => f.services?.includes(ROWING_SERVICE_UUID)),
    ).toBe(false);
    // ...but it must still be reachable once connected, which is what
    // `optionalServices` is for.
    expect(options.optionalServices).toContain(ROWING_SERVICE_UUID);
    expect(options.optionalServices).toContain(CONTROL_SERVICE_UUID);
  });
});

describe("createWebBluetoothTransport: D6 — the characteristic cache is cleared on connect", () => {
  it("a write AFTER a reconnect succeeds, because the transport re-fetched instead of reusing a dead handle", async () => {
    const device = new FakeDevice("pm5-5", "PM5 555");
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();

    await transport.scan();
    await transport.connect(device.id);
    await transport.write(RECEIVE_CHARACTERISTIC_UUID, Uint8Array.from([1, 2]));
    const beforeDrop = device.gatt.issued[0]!;

    device.dropLink(); // Chrome invalidates every cached handle here
    expect(beforeDrop.valid).toBe(false);

    await transport.connect(device.id);
    // THE test for the session's worst bug: this write threw
    // `InvalidStateError` on real hardware while CI stayed green, because
    // the transport kept its pre-drop handle and the fake transport had no
    // handle invalidation to expose it. Every post-reconnect write failed —
    // the one path `Transport` is required to keep working.
    await expect(
      transport.write(RECEIVE_CHARACTERISTIC_UUID, Uint8Array.from([3, 4])),
    ).resolves.toBeUndefined();

    // Re-fetched, not reused: a fresh service lookup and a fresh handle,
    // and the write landed on the NEW one.
    expect(device.gatt.getPrimaryService).toHaveBeenCalledTimes(2);
    const afterReconnect = device.gatt.issued[0]!;
    expect(afterReconnect).not.toBe(beforeDrop);
    expect(afterReconnect.writes).toHaveLength(1);
    expect(beforeDrop.writes).toHaveLength(1);
  });

  it("within ONE connection the cache still holds — the clear happens on connect, not on every write", async () => {
    const device = new FakeDevice("pm5-6", "PM5 666");
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();

    await transport.scan();
    await transport.connect(device.id);
    await transport.write(RECEIVE_CHARACTERISTIC_UUID, Uint8Array.from([1]));
    await transport.write(RECEIVE_CHARACTERISTIC_UUID, Uint8Array.from([2]));

    expect(device.gatt.getPrimaryService).toHaveBeenCalledTimes(1);
    expect(device.gatt.issued).toHaveLength(1);
    expect(device.gatt.issued[0]!.writes).toHaveLength(2);
  });
});

describe("createWebBluetoothTransport: exactly one gattserverdisconnected listener (fixed live at the erg)", () => {
  it("a second connect() on the same device leaves ONE listener, so one drop fires onDisconnect once", async () => {
    const device = new FakeDevice("pm5-7", "PM5 777");
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();
    const drops: string[] = [];
    transport.onDisconnect((reason) => drops.push(reason));

    await transport.scan();
    await transport.connect(device.id);
    await transport.connect(device.id); // re-connect without a drop in between

    device.dropLink();

    // The behavioural half. Note this alone is NOT sufficient evidence: a
    // spec-compliant `EventTarget` refuses to register the same listener
    // twice, so it would pass even without the removal — hence the ledger
    // assertion below, which pins the transport's own idempotence rather
    // than the DOM's.
    expect(drops).toHaveLength(1);
    // The structural half: every add is preceded by its own remove, so no
    // sequence of connect() calls can ever stack a second registration —
    // true regardless of whether the underlying EventTarget dedupes.
    expect(device.ledgerFor("gattserverdisconnected")).toStrictEqual([
      "remove",
      "add",
      "remove",
      "add",
    ]);
  });
});

// Fast-follow Task 1, adversarial review I8: `webBluetooth.ts` owns its OWN
// `SERVICE_OF` map, separate from `capacitorBle.ts`'s — a missing entry
// here is worse than that file's synchronous throw, because `subscribe()`'s
// characteristic lookup is async and its rejection is void-discarded
// (`webBluetooth.ts`'s own `subscribe()`, "Fire-and-forget"): an unhandled
// rejection plus a silently dead subscription, never a loud failure. The
// membership pin below uses `write()` (awaited, so a missing entry surfaces
// as a REJECTION this test can assert on) rather than `subscribe()`, which
// would only prove the promise it returns is unobservably broken.
describe("createWebBluetoothTransport: 0x0039/0x003A join SERVICE_OF (fast-follow R1, review I8)", () => {
  it.each([
    ["END_OF_WORKOUT_SUMMARY_UUID (0x0039)", END_OF_WORKOUT_SUMMARY_UUID],
    [
      "END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID (0x003A)",
      END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
    ],
  ])(
    "write() to %s resolves against the rowing service, not an unknown-service throw",
    async (_name, uuid) => {
      const device = new FakeDevice("pm5-8", "PM5 888");
      installFakeBluetooth(device);
      const transport = createWebBluetoothTransport();

      await transport.scan();
      await transport.connect(device.id);

      await expect(
        transport.write(uuid, Uint8Array.from([1])),
      ).resolves.toBeUndefined();

      expect(device.gatt.getPrimaryService).toHaveBeenCalledWith(
        ROWING_SERVICE_UUID,
      );
    },
  );
});

// Phase RC spec 1, Task 2: 0x003F (LOGGED_WORKOUT_UUID, the "C2 rowing
// logged workout characteristic") joins SERVICE_OF too — same membership
// pin as the 0x0039/0x003A block above, via write() rather than
// subscribe() for the same reason that block's own comment gives (a
// missing entry surfaces as an awaited REJECTION here, not a silently
// dead fire-and-forget subscription).
describe("createWebBluetoothTransport: 0x003F joins SERVICE_OF (Phase RC spec 1 Task 2)", () => {
  it("write() to LOGGED_WORKOUT_UUID resolves against the rowing service (0x0030), the same service 0x0039 maps to", async () => {
    const device = new FakeDevice("pm5-9", "PM5 999");
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();

    await transport.scan();
    await transport.connect(device.id);

    await expect(
      transport.write(LOGGED_WORKOUT_UUID, Uint8Array.from([1])),
    ).resolves.toBeUndefined();

    expect(device.gatt.getPrimaryService).toHaveBeenCalledWith(
      ROWING_SERVICE_UUID,
    );
  });
});

/** Drains every pending microtask, regardless of how many hops the chain
 *  under test needs — a fixed number of `await Promise.resolve()` calls is
 *  fragile against a chain this deep (`getCharacteristic`'s own two
 *  `await`s, plus the `.then().catch()` this fix adds each add a hop), so
 *  this parks behind a real macrotask instead: by the time `setTimeout`'s
 *  callback runs, the JS engine has necessarily drained the ENTIRE
 *  microtask queue first, however many links the promise chain has. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// C1 fix (final-review): `subscribe()`'s GATT lookup is async
// (`getCharacteristic`), and `Transport.subscribe` must return its
// unsubscribe closure SYNCHRONOUSLY — before this fix, a rejection here
// (a firmware missing the characteristic, e.g. the hold-open instrument's
// 0x003F) went into a `void`ed promise with no `.catch()` at all: not a
// throw, not an observable rejection, identical to a firmware that HAS the
// characteristic and simply never sends. `getPrimaryService` is overridden
// per test below to make a NAMED characteristic's own `getCharacteristic`
// reject — the real shape Chrome throws (`DOMException`/`NotFoundError`)
// when a service exists but the requested characteristic does not.
describe("createWebBluetoothTransport: subscribe() rejection is observable via onCharacteristicDegraded (C1, final-review)", () => {
  function installRejectingCharacteristic(
    device: FakeDevice,
    rejectId: string,
    error: Error,
  ): void {
    device.gatt.getPrimaryService = vi.fn(
      async (
        service: string,
      ): Promise<{
        getCharacteristic(id: string): Promise<FakeCharacteristic>;
      }> => {
        if (!device.gatt.connected) {
          throw new Error(
            `FakeGattServer: getPrimaryService(${service}) while disconnected`,
          );
        }
        return {
          getCharacteristic: (id: string) => {
            if (id === rejectId) return Promise.reject(error);
            const characteristic = new FakeCharacteristic(id);
            device.gatt.issued.push(characteristic);
            return Promise.resolve(characteristic);
          },
        };
      },
    );
  }

  it("a subscribe() whose GATT lookup rejects notifies onCharacteristicDegraded instead of disappearing into a void'd promise — the exact gap C1 names", async () => {
    const device = new FakeDevice("pm5-c1-1", "PM5 C1 1");
    installFakeBluetooth(device);
    const notFound = new Error(
      "No Characteristics matching UUID ce06003f-... found in Service.",
    );
    notFound.name = "NotFoundError";
    installRejectingCharacteristic(device, LOGGED_WORKOUT_UUID, notFound);
    const transport = createWebBluetoothTransport();

    await transport.scan();
    await transport.connect(device.id);
    const degraded = vi.fn();
    transport.onCharacteristicDegraded(degraded);

    transport.subscribe(LOGGED_WORKOUT_UUID, () => {
      throw new Error("must never fire — the lookup rejected");
    });
    await flushMicrotasks();

    expect(degraded).toHaveBeenCalledExactlyOnceWith(
      LOGGED_WORKOUT_UUID,
      notFound.message,
    );
  });

  it("a successful subscribe() never fires onCharacteristicDegraded", async () => {
    const device = new FakeDevice("pm5-c1-2", "PM5 C1 2");
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();

    await transport.scan();
    await transport.connect(device.id);
    const degraded = vi.fn();
    transport.onCharacteristicDegraded(degraded);

    transport.subscribe(LOGGED_WORKOUT_UUID, () => undefined);
    await flushMicrotasks();

    expect(degraded).not.toHaveBeenCalled();
  });

  it("TWO independently registered listeners BOTH fire — a fan-out, not capacitorBle.ts's single overwritable slot (so useMonitorSession.ts's own driver-level registration and holdOpen.ts's instrument can coexist)", async () => {
    const device = new FakeDevice("pm5-c1-3", "PM5 C1 3");
    installFakeBluetooth(device);
    const failure = new Error("gone");
    installRejectingCharacteristic(device, LOGGED_WORKOUT_UUID, failure);
    const transport = createWebBluetoothTransport();

    await transport.scan();
    await transport.connect(device.id);
    const first = vi.fn();
    const second = vi.fn();
    transport.onCharacteristicDegraded(first);
    transport.onCharacteristicDegraded(second);

    transport.subscribe(LOGGED_WORKOUT_UUID, () => undefined);
    await flushMicrotasks();

    expect(first).toHaveBeenCalledExactlyOnceWith(LOGGED_WORKOUT_UUID, "gone");
    expect(second).toHaveBeenCalledExactlyOnceWith(LOGGED_WORKOUT_UUID, "gone");
  });

  it("unsubscribing BEFORE the GATT lookup settles suppresses the degraded report — the caller asked to stop hearing about this characteristic, failure included", async () => {
    const device = new FakeDevice("pm5-c1-4", "PM5 C1 4");
    installFakeBluetooth(device);
    installRejectingCharacteristic(device, LOGGED_WORKOUT_UUID, new Error("x"));
    const transport = createWebBluetoothTransport();

    await transport.scan();
    await transport.connect(device.id);
    const degraded = vi.fn();
    transport.onCharacteristicDegraded(degraded);

    const unsubscribe = transport.subscribe(
      LOGGED_WORKOUT_UUID,
      () => undefined,
    );
    unsubscribe(); // before any microtask has let the rejection land
    await flushMicrotasks();

    expect(degraded).not.toHaveBeenCalled();
  });
});

/** Helper to capture promise outcomes for assertion after the event loop
 *  has processed them (same pattern as capacitorBle.test.ts:267-273). */
type Settled =
  | { status: "fulfilled"; value: unknown }
  | { status: "rejected"; value: unknown };

function settled(promise: Promise<unknown>): Promise<Settled> {
  return promise.then(
    (value): Settled => ({ status: "fulfilled", value }),
    (value: unknown): Settled => ({ status: "rejected", value }),
  );
}

describe("createWebBluetoothTransport: connect() timeout race (spec §6, R2-web)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    return () => {
      vi.useRealTimers();
    };
  });

  it("gatt.connect() never settles → connect() rejects at 10_000ms with 'Connection timeout.'", async () => {
    const device = new FakeDevice("pm5-timeout-1", "PM5 9991");
    // Make gatt.connect() hang forever
    device.gatt.connect = vi.fn(() => new Promise(() => {}));
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();

    await transport.scan();
    const outcome = settled(transport.connect(device.id));

    // Nothing fires before 10s
    await vi.advanceTimersByTimeAsync(9_999);
    // Nothing fires a moment early
    expect(vi.getTimerCount()).toBe(1);

    // Advance to the timeout
    await vi.advanceTimersByTimeAsync(1);

    const settledConnect = await outcome;
    expect(settledConnect.status).toBe("rejected");
    expect(settledConnect.value).toBeInstanceOf(Error);
    expect((settledConnect.value as Error).message).toContain(
      "Connection timeout.",
    );
  });

  it("late RESOLVE after race lost → gatt.disconnect() is CALLED on the zombie before dropping it", async () => {
    const device = new FakeDevice("pm5-timeout-2", "PM5 9992");
    let resolveConnect: ((value: FakeGattServer) => void) | null = null;
    device.gatt.connect = vi.fn(
      () =>
        new Promise<FakeGattServer>((resolve) => {
          resolveConnect = resolve as (value: FakeGattServer) => void;
        }),
    );
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();

    await transport.scan();
    const outcome = settled(transport.connect(device.id));

    // Advance to timeout
    await vi.advanceTimersByTimeAsync(10_001);

    const settledConnect = await outcome;
    expect(settledConnect.status).toBe("rejected");
    expect((settledConnect.value as Error).message).toContain(
      "Connection timeout.",
    );

    // Now the late resolve happens — this triggers the .then() handler
    expect(resolveConnect).not.toBeNull();
    resolveConnect!(device.gatt);

    // Flush microtasks to ensure the disconnect is called
    await vi.advanceTimersByTimeAsync(0);

    // The zombie gatt.disconnect() MUST have been called
    expect(device.gatt.disconnect).toHaveBeenCalled();
  });

  it("late REJECT after race lost → swallowed, no unhandled rejection", async () => {
    const device = new FakeDevice("pm5-timeout-3", "PM5 9993");
    let rejectConnect: ((err: unknown) => void) | null = null;
    device.gatt.connect = vi.fn(
      () =>
        new Promise<FakeGattServer>((_resolve, reject) => {
          rejectConnect = reject as (err: unknown) => void;
        }),
    );
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();

    await transport.scan();
    const outcome = settled(transport.connect(device.id));

    // Advance to timeout
    await vi.advanceTimersByTimeAsync(10_001);

    const settledConnect = await outcome;
    // The race already rejected with the timeout (postcondition 1)
    expect(settledConnect.status).toBe("rejected");
    expect((settledConnect.value as Error).message).toContain(
      "Connection timeout.",
    );

    // Now the late reject happens — this rejection gets caught by the
    // raceConnectTimeout's .then() handler, which swallows it (the
    // attached handler prevents unhandled rejection).
    expect(rejectConnect).not.toBeNull();
    rejectConnect!(new Error("Late radio error"));

    // Flush microtasks — Vitest detects unhandled rejections in the runner,
    // so if the rejection leaks, this would fail automatically (postcondition 2)
    await vi.advanceTimersByTimeAsync(0);

    // If we reach here without Vitest aborting the test, the late rejection
    // was successfully swallowed.
  });

  it("an in-time connect → behavior unchanged, no new awaits observable", async () => {
    const device = new FakeDevice("pm5-timeout-4", "PM5 9994");
    device.gatt.connect = vi.fn(() => Promise.resolve(device.gatt));
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();

    await transport.scan();
    // This should resolve immediately without waiting for the timeout
    await expect(transport.connect(device.id)).resolves.toBeUndefined();

    // The gatt.connect() was called once
    expect(device.gatt.connect).toHaveBeenCalledTimes(1);
  });

  it("late RESOLVE → zombie disconnect does NOT fire onDisconnect callback (M-2 guard)", async () => {
    const device = new FakeDevice("pm5-timeout-5", "PM5 9995");
    let resolveConnect: ((value: FakeGattServer) => void) | null = null;
    device.gatt.connect = vi.fn(
      () =>
        new Promise<FakeGattServer>((resolve) => {
          resolveConnect = resolve as (value: FakeGattServer) => void;
        }),
    );
    installFakeBluetooth(device);
    const transport = createWebBluetoothTransport();
    const drops: string[] = [];
    transport.onDisconnect((reason) => drops.push(reason));

    await transport.scan();
    const outcome = settled(transport.connect(device.id));

    // Advance to timeout
    await vi.advanceTimersByTimeAsync(10_001);
    await outcome;

    // The late resolve happens and triggers zombie disconnect
    expect(resolveConnect).not.toBeNull();
    resolveConnect!(device.gatt);

    // Flush all microtasks including the gattserverdisconnected event
    await vi.advanceTimersByTimeAsync(0);

    // The M-2 guard prevented onDisconnect from firing (the guard was set
    // before the zombie disconnect, so gattserverdisconnected is suppressed)
    expect(drops).toStrictEqual([]);
  });
});
