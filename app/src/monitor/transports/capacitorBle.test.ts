import { describe, expect, it, vi } from "vitest";

// M-2 (final-review): `Transport.onDisconnect`'s own contract
// (domain/monitor/types.ts:120-125) says it is "never fired by a
// caller-initiated disconnect()" — but the real `@capacitor-community/
// bluetooth-le` fires the SAME disconnect callback `BleClient.connect()`
// was given regardless of who initiated the drop. This file is
// coverage-excluded (vitest.config.ts: no real BLE radio exists in CI) and
// its own header comment says "compile-tested shapes" is its ceiling — but
// the CONTRACT above is pinnable without any radio at all: a jsdom-safe
// mock of `BleClient` that calls the disconnect callback exactly the way
// the real library does is enough to prove `capacitorBle.ts`'s own guard
// (not BleClient's behavior — that part is genuinely untestable here)
// suppresses a caller-initiated drop and passes through a real one.
const handlers = new Map<string, (id: string) => void>();

vi.mock("@capacitor-community/bluetooth-le", () => ({
  BleClient: {
    initialize: vi.fn().mockResolvedValue(undefined),
    requestDevice: vi.fn(),
    connect: vi.fn((id: string, onDisconnect: (id: string) => void) => {
      handlers.set(id, onDisconnect);
      return Promise.resolve();
    }),
    disconnect: vi.fn((id: string) => {
      // The real library's own documented behavior (M-2's finding): calling
      // disconnect() invokes the SAME callback `connect()` registered, with
      // no distinction from an unexpected drop.
      handlers.get(id)?.(id);
      return Promise.resolve();
    }),
    write: vi.fn().mockResolvedValue(undefined),
    startNotifications: vi.fn().mockResolvedValue(undefined),
    stopNotifications: vi.fn().mockResolvedValue(undefined),
  },
  numbersToDataView: vi.fn(),
  toUint8Array: vi.fn(),
}));

const { createCapacitorBleTransport } = await import("./capacitorBle");

describe("createCapacitorBleTransport: onDisconnect contract (M-2)", () => {
  it("a caller-initiated disconnect() does NOT fire onDisconnect", async () => {
    const transport = createCapacitorBleTransport();
    const drops: string[] = [];
    transport.onDisconnect((reason) => drops.push(reason));

    await transport.connect("pm5-1");
    await transport.disconnect();

    expect(drops).toStrictEqual([]);
  });

  it("an UNEXPECTED disconnect (the library's own callback firing with nothing having called disconnect() first) still fires onDisconnect — the guard only swallows caller-initiated drops, never real ones", async () => {
    const transport = createCapacitorBleTransport();
    const drops: string[] = [];
    transport.onDisconnect((reason) => drops.push(reason));

    await transport.connect("pm5-2");
    // Simulates a genuine radio drop: the library invokes the disconnect
    // callback it was given at connect() time, with nothing having called
    // this transport's own disconnect() first.
    handlers.get("pm5-2")?.("pm5-2");

    expect(drops).toHaveLength(1);
    expect(drops[0]).toContain("pm5-2");
  });

  it("a RECONNECT clears the guard — a caller-initiated disconnect from the PRIOR connection can never suppress the new one's genuine drop", async () => {
    const transport = createCapacitorBleTransport();
    const drops: string[] = [];
    transport.onDisconnect((reason) => drops.push(reason));

    await transport.connect("pm5-3");
    await transport.disconnect(); // arms and consumes the guard once
    await transport.connect("pm5-3"); // reconnect — must reset the guard
    handlers.get("pm5-3")?.("pm5-3"); // a genuine drop on the NEW connection

    expect(drops).toHaveLength(1);
  });
});
