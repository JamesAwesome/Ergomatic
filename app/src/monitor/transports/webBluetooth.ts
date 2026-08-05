// The desktop-dev/laptop `Transport` (ROADMAP Phase 7, research doc
// docs/superpowers/research/2026-07-27-pm5-ble-research.md: "Web Bluetooth
// = Chromium-only"): `navigator.bluetooth`, the browser-native API
// `@capacitor-community/bluetooth-le` (`capacitorBle.ts`) itself mirrors.
// This is the transport James's laptop-vs-real-PM5 session
// (interface-notes.md §17) runs against, since a laptop has no Capacitor
// native shell to host the other adapter.
//
// HONEST COVERAGE BOUNDARY: excluded from the coverage gate
// (`vitest.config.ts`, beside `src/native/**` and `capacitorBle.ts`) for
// the identical reason — no Chromium-with-a-real-PM5-in-range exists in
// CI, and mocking `navigator.bluetooth` would only prove this file calls
// its own mock correctly. "Compile-tested shapes" is this file's ceiling
// for 7A; the genuine radio proof is the laptop session, post-merge.
//
// TypeScript's own DOM lib does not ship Web Bluetooth types (verified:
// no `Bluetooth`/`BluetoothDevice` declaration anywhere in
// typescript/lib/lib.dom.d.ts) — rather than add an unpinned
// `@types/web-bluetooth` dependency the brief never names, this file
// declares the small subset of the spec it actually calls, scoped to this
// module via `declare global` augmentation of `Navigator`.

import {
  ADDITIONAL_SPLIT_INTERVAL_DATA_UUID,
  ADDITIONAL_STATUS_1_UUID,
  ADDITIONAL_STATUS_2_UUID,
  CONTROL_SERVICE_UUID,
  GENERAL_STATUS_UUID,
  RECEIVE_CHARACTERISTIC_UUID,
  ROWING_SERVICE_UUID,
  SAMPLE_RATE_UUID,
  SPLIT_INTERVAL_DATA_UUID,
  TRANSMIT_CHARACTERISTIC_UUID,
} from "../../../domain/monitor/pm5/uuids.js";
import type {
  DiscoveredMonitor,
  Transport,
} from "../../../domain/monitor/types.js";

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly value?: DataView;
  // Typed `Uint8Array` here, not the spec's `BufferSource`: this ambient
  // declaration only needs to match what THIS file ever actually passes
  // (always a `Uint8Array`, `Transport.write`'s own parameter type) — the
  // real DOM lib's generic `ArrayBufferView<TArrayBuffer>` machinery (TS
  // 5.7+) rejects a plain `Uint8Array<ArrayBufferLike>` here for reasons
  // that have nothing to do with this module's own correctness.
  writeValue(value: Uint8Array): Promise<void>;
  writeValueWithoutResponse?(value: Uint8Array): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(
    characteristic: string,
  ): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothRequestDeviceOptions {
  filters: Array<{ services: string[] }>;
  optionalServices?: string[];
}

interface Bluetooth {
  requestDevice(
    options: BluetoothRequestDeviceOptions,
  ): Promise<BluetoothDevice>;
}

declare global {
  interface Navigator {
    readonly bluetooth?: Bluetooth;
  }
}

// Same lookup, same duplication rationale, as `capacitorBle.ts`'s own
// `SERVICE_OF` comment — a real GATT call needs the characteristic's
// OWNING service, which `Transport.write`/`subscribe`'s bare-id signature
// doesn't carry.
const SERVICE_OF: Readonly<Record<string, string>> = {
  [RECEIVE_CHARACTERISTIC_UUID]: CONTROL_SERVICE_UUID,
  [TRANSMIT_CHARACTERISTIC_UUID]: CONTROL_SERVICE_UUID,
  [GENERAL_STATUS_UUID]: ROWING_SERVICE_UUID,
  [ADDITIONAL_STATUS_1_UUID]: ROWING_SERVICE_UUID,
  [ADDITIONAL_STATUS_2_UUID]: ROWING_SERVICE_UUID,
  [SAMPLE_RATE_UUID]: ROWING_SERVICE_UUID,
  [SPLIT_INTERVAL_DATA_UUID]: ROWING_SERVICE_UUID,
  [ADDITIONAL_SPLIT_INTERVAL_DATA_UUID]: ROWING_SERVICE_UUID,
};

function serviceFor(characteristicId: string): string {
  const service = SERVICE_OF[characteristicId];
  if (!service) {
    throw new Error(
      `webBluetooth: no known service for characteristic ${characteristicId}`,
    );
  }
  return service;
}

function toBytes(value: DataView): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

/**
 * Builds a `Transport` backed by `navigator.bluetooth`. `scan()` opens the
 * browser's own device picker (`requestDevice`, filtered to the C2 Rowing
 * service) — a single-result picker, the same shape `capacitorBle.ts`'s
 * `BleClient.requestDevice` has, so both adapters present one consistent
 * flow to whatever screen (7B) calls `Transport.scan()`. `connect(id)`
 * only accepts the id THIS transport's own `scan()` just returned (Web
 * Bluetooth has no id-keyed re-connect the way `BleClient` does — the
 * `BluetoothDevice` object itself, not a bare string, is what `.gatt`
 * lives on), so a caller passing any other id fails loudly rather than
 * silently reconnecting to the wrong device.
 */
export function createWebBluetoothTransport(): Transport {
  let device: BluetoothDevice | null = null;
  let server: BluetoothRemoteGATTServer | null = null;
  let disconnectCb: ((reason: string) => void) | null = null;
  const characteristics = new Map<string, BluetoothRemoteGATTCharacteristic>();

  function handleGattServerDisconnected(): void {
    disconnectCb?.("webBluetooth: gattserverdisconnected");
  }

  async function getCharacteristic(
    characteristicId: string,
  ): Promise<BluetoothRemoteGATTCharacteristic> {
    const cached = characteristics.get(characteristicId);
    if (cached) return cached;
    if (!server) {
      throw new Error("webBluetooth: write/subscribe called before connect()");
    }
    const service = await server.getPrimaryService(
      serviceFor(characteristicId),
    );
    const characteristic = await service.getCharacteristic(characteristicId);
    characteristics.set(characteristicId, characteristic);
    return characteristic;
  }

  return {
    async scan(): Promise<DiscoveredMonitor[]> {
      if (!navigator.bluetooth) {
        throw new Error(
          "webBluetooth: navigator.bluetooth is unavailable — Chromium only (design spec's own research note)",
        );
      }
      device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [ROWING_SERVICE_UUID] }],
        optionalServices: [CONTROL_SERVICE_UUID, ROWING_SERVICE_UUID],
      });
      return [{ id: device.id, name: device.name ?? "PM5" }];
    },

    async connect(id: string): Promise<void> {
      if (!device || device.id !== id) {
        throw new Error(
          "webBluetooth: connect() must be called with the id this transport's own scan() returned",
        );
      }
      if (!device.gatt) {
        throw new Error("webBluetooth: device has no GATT server");
      }
      device.addEventListener(
        "gattserverdisconnected",
        handleGattServerDisconnected,
      );
      server = await device.gatt.connect();
    },

    async write(characteristicId: string, bytes: Uint8Array): Promise<void> {
      const characteristic = await getCharacteristic(characteristicId);
      if (characteristic.writeValueWithoutResponse) {
        await characteristic.writeValueWithoutResponse(bytes);
      } else {
        await characteristic.writeValue(bytes);
      }
    },

    subscribe(
      characteristicId: string,
      cb: (bytes: Uint8Array) => void,
    ): () => void {
      let cancelled = false;
      let subscribed: BluetoothRemoteGATTCharacteristic | null = null;
      const listener = (): void => {
        const value = subscribed?.value;
        if (value) cb(toBytes(value));
      };
      // Fire-and-forget, same reason `capacitorBle.ts`'s own subscribe
      // gives: GATT characteristic resolution is async, but `Transport.
      // subscribe`'s signature must return the unsubscribe closure
      // synchronously.
      void getCharacteristic(characteristicId).then((characteristic) => {
        if (cancelled) return;
        subscribed = characteristic;
        characteristic.addEventListener("characteristicvaluechanged", listener);
        void characteristic.startNotifications();
      });
      return () => {
        cancelled = true;
        if (subscribed) {
          subscribed.removeEventListener(
            "characteristicvaluechanged",
            listener,
          );
          void subscribed.stopNotifications();
        }
      };
    },

    async disconnect(): Promise<void> {
      server?.disconnect();
    },

    onDisconnect(cb: (reason: string) => void): () => void {
      disconnectCb = cb;
      return () => {
        if (disconnectCb === cb) disconnectCb = null;
      };
    },
  };
}
