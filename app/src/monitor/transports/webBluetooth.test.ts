import { describe, expect, it, vi, afterEach } from "vitest";
import { createWebBluetoothTransport } from "./webBluetooth";

// M-2 (final-review): same contract, same reasoning as
// `capacitorBle.test.ts`'s own header comment — `Transport.onDisconnect`
// (domain/monitor/types.ts:120-125) must never fire for a caller-initiated
// `disconnect()`. `webBluetooth.ts` is coverage-excluded (no Chromium-with-
// a-real-PM5 exists in CI), but the GUARD this file added is pinnable
// against a jsdom-safe fake `navigator.bluetooth`/`BluetoothDevice` that
// fires `gattserverdisconnected` the same way the real spec does — this
// proves `webBluetooth.ts`'s own logic, not the browser's.

class FakeGattServer {
  device!: FakeDevice;
  connected = false;
  connect = vi.fn((): Promise<FakeGattServer> => {
    this.connected = true;
    return Promise.resolve(this);
  });
  disconnect = vi.fn(() => {
    this.connected = false;
    this.device.fireGattServerDisconnected();
  });
  getPrimaryService = vi.fn();
}

class FakeDevice extends EventTarget {
  readonly id: string;
  readonly name: string;
  readonly gatt: FakeGattServer;

  constructor(id: string, name: string) {
    super();
    this.id = id;
    this.name = name;
    this.gatt = new FakeGattServer();
    this.gatt.device = this;
  }

  fireGattServerDisconnected(): void {
    this.dispatchEvent(new Event("gattserverdisconnected"));
  }
}

function installFakeBluetooth(device: FakeDevice): void {
  Object.assign(globalThis.navigator, {
    bluetooth: { requestDevice: vi.fn().mockResolvedValue(device) },
  });
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
