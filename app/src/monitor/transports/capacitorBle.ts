// The primary iOS `Transport` (design spec/ROADMAP Phase 7: "the PRIMARY
// path"): `@capacitor-community/bluetooth-le@8.2.0`, which mirrors the Web
// Bluetooth API closely enough that this file and `webBluetooth.ts` share
// the same shape almost line for line — the difference is entirely in
// which radio library's calls fill each `Transport` method, never in the
// PM5 protocol itself (that knowledge stays in `domain/monitor/pm5/`, whose
// UUID constants are the only Concept2-specific thing either file touches).
//
// HONEST COVERAGE BOUNDARY: this file is excluded from the coverage gate
// (`vitest.config.ts`, beside `src/native/**`) for the same reason that
// exclusion exists at all — there is no BLE radio in CI, and a mocked
// `BleClient` would only prove this file calls a mock correctly, not that
// it talks to a real PM5. The one live-hardware verification the design
// spec's own exit criterion requires happens on James's laptop/device,
// post-merge (interface-notes.md §17) — never as a CI assertion. Nothing
// in this file (or its test suite, if one exists) may claim to test real
// radio behavior; "compile-tested shapes" is the ceiling for 7A.

import {
  BleClient,
  numbersToDataView,
  toUint8Array,
} from "@capacitor-community/bluetooth-le";
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

// `Transport.write`/`subscribe` take a bare characteristic id (design's own
// choice, `types.ts`'s header comment) — a real GATT call needs the OWNING
// SERVICE too, so each adapter carries this small lookup. Deliberately
// duplicated in `webBluetooth.ts` rather than factored into a shared
// export: both files are already "thin" per the brief, and the alternative
// (a new domain/monitor/pm5/ export named in neither task's file list)
// would touch a module this task isn't scoped to.
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
      `capacitorBle: no known service for characteristic ${characteristicId}`,
    );
  }
  return service;
}

/**
 * Builds a `Transport` backed by `@capacitor-community/bluetooth-le`'s
 * module-level `BleClient`. `scan()` opens the OS's native device picker
 * (`BleClient.requestDevice`, filtered to the C2 Rowing service) rather
 * than a background scan — the same single-result shape
 * `webBluetooth.ts`'s `navigator.bluetooth.requestDevice` has, so callers
 * above `Transport` see one consistent picker-style flow regardless of
 * which adapter is live. `write`/`subscribe` both throw synchronously (via
 * `serviceFor`) on an unrecognized characteristic id or a call before
 * `connect()` — a programming error in the caller, not a runtime radio
 * condition, so failing loudly beats a silent no-op.
 */
export function createCapacitorBleTransport(): Transport {
  let deviceId: string | null = null;
  let disconnectCb: ((reason: string) => void) | null = null;
  // M-2 (final-review): `Transport.onDisconnect`'s own contract
  // (types.ts:120-125) says it is "never fired by a caller-initiated
  // disconnect()" — but `BleClient.disconnect()` below invokes the SAME
  // `handleDisconnect` callback `connect()` registered for a genuine radio
  // drop, and this file had NO guard against that before this fix, so
  // every deliberate `disconnect()` call would ALSO fire `onDisconnect`,
  // arming a driver's `reconnectPending` after a rower hung up on purpose.
  // Set immediately before the caller-initiated `disconnect()` call,
  // consumed (and reset) the first time the callback runs — a fresh
  // `connect()` also resets it, so a stale `true` can never survive into a
  // NEW connection's own genuine drop.
  let callerInitiatedDisconnect = false;

  function requireConnected(characteristicId: string): {
    id: string;
    service: string;
  } {
    if (deviceId === null) {
      throw new Error("capacitorBle: write/subscribe called before connect()");
    }
    return { id: deviceId, service: serviceFor(characteristicId) };
  }

  function handleDisconnect(disconnectedId: string): void {
    if (callerInitiatedDisconnect) {
      callerInitiatedDisconnect = false;
      return;
    }
    disconnectCb?.(`capacitorBle: device ${disconnectedId} disconnected`);
  }

  return {
    async scan(): Promise<DiscoveredMonitor[]> {
      await BleClient.initialize();
      const device = await BleClient.requestDevice({
        services: [ROWING_SERVICE_UUID],
        optionalServices: [CONTROL_SERVICE_UUID, ROWING_SERVICE_UUID],
        namePrefix: "PM5",
      });
      return [{ id: device.deviceId, name: device.name ?? "PM5" }];
    },

    async connect(id: string): Promise<void> {
      // A fresh connection never inherits a stale flag from a PRIOR one
      // (M-2's own comment on the variable above).
      callerInitiatedDisconnect = false;
      await BleClient.connect(id, handleDisconnect);
      deviceId = id;
    },

    async write(characteristicId: string, bytes: Uint8Array): Promise<void> {
      const { id, service } = requireConnected(characteristicId);
      await BleClient.write(
        id,
        service,
        characteristicId,
        numbersToDataView(Array.from(bytes)),
      );
    },

    subscribe(
      characteristicId: string,
      cb: (bytes: Uint8Array) => void,
    ): () => void {
      const { id, service } = requireConnected(characteristicId);
      // Fire-and-forget, same idiom driver.ts's own sample-rate write uses
      // for a call this synchronous `Transport.subscribe` signature cannot
      // itself await: `startNotifications` resolves once registration
      // completes, well after this function must already have returned an
      // unsubscribe closure.
      void BleClient.startNotifications(
        id,
        service,
        characteristicId,
        (value) => {
          cb(toUint8Array(value) ?? new Uint8Array(0));
        },
      );
      return () => {
        void BleClient.stopNotifications(id, service, characteristicId);
      };
    },

    async disconnect(): Promise<void> {
      if (deviceId !== null) {
        callerInitiatedDisconnect = true;
        await BleClient.disconnect(deviceId);
      }
    },

    onDisconnect(cb: (reason: string) => void): () => void {
      disconnectCb = cb;
      return () => {
        if (disconnectCb === cb) disconnectCb = null;
      };
    },
  };
}
