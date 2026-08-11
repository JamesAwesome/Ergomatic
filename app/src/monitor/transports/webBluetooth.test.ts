import { describe, expect, it, vi, afterEach } from "vitest";
import {
  CONTROL_SERVICE_UUID,
  DEVICE_INFO_SERVICE_UUID,
  END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
  END_OF_WORKOUT_SUMMARY_UUID,
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
