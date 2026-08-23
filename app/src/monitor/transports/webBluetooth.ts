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
  DEVICE_INFO_SERVICE_UUID,
  END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID,
  END_OF_WORKOUT_SUMMARY_UUID,
  GENERAL_STATUS_UUID,
  LOGGED_WORKOUT_UUID,
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
  filters: Array<{ services?: string[]; namePrefix?: string }>;
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

// Spec §6, matching the iOS native bound (Plugin.swift CONNECTION_TIMEOUT).
// The web path's gatt.connect() has no built-in timeout like the iOS plugin
// does, so the race wraps it here. On expiry, reject with the SAME literal
// the iOS plugin uses, so the classifier's existing fall-through to
// `link-failed` covers both transports with one vocabulary.
const CONNECT_TIMEOUT_MS = 10_000;

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
  [END_OF_WORKOUT_SUMMARY_UUID]: ROWING_SERVICE_UUID,
  [END_OF_WORKOUT_ADDITIONAL_SUMMARY_UUID]: ROWING_SERVICE_UUID,
  // Phase RC spec 1, Task 2 (design spec §3): 0x003F is in the C2 rowing
  // service 0x0030 too, same as the pair above.
  [LOGGED_WORKOUT_UUID]: ROWING_SERVICE_UUID,
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

/** Races gatt.connect() against `CONNECT_TIMEOUT_MS`, handling BOTH outcomes
 *  of the abandoned loser explicitly (spec §6, adversarial I7). A late
 *  RESOLUTION is NOT dropped the way raceScanTimeout does — a gatt.connect()
 *  that resolves after the race lost is a ZOMBIE LIVE LINK, not a harmless
 *  stale pick. The late-resolve arm calls `gatt.disconnect()` on the zombie
 *  before dropping it, after arming the M-2 guard via the callback. A late
 *  REJECTION (an error in gatt.connect() that arrives after the timeout) is
 *  swallowed — the outer promise has already rejected with the timeout, and
 *  the attached handler prevents an unhandled rejection. */
function raceConnectTimeout(
  pipeline: Promise<BluetoothRemoteGATTServer>,
  gatt: BluetoothRemoteGATTServer,
  beforeZombieDisconnect: () => void,
): Promise<BluetoothRemoteGATTServer> {
  return new Promise<BluetoothRemoteGATTServer>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("Connection timeout."));
      }
    }, CONNECT_TIMEOUT_MS);
    pipeline.then(
      (server) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve(server);
        } else {
          // Late resolve: the gatt.connect() succeeded after the race lost.
          // This is a live link that needs cleanup, not a harmless stale
          // pick (spec §6, adversarial I7). Arm the M-2 caller-initiated-
          // disconnect guard before the zombie disconnect to prevent
          // gattserverdisconnected from firing onDisconnect.
          beforeZombieDisconnect();
          gatt.disconnect();
        }
      },
      (err: unknown) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(err);
        }
        // Else: a late rejection from gatt.connect(), swallowed by the
        // attached handler — the outer promise already rejected with the
        // timeout. THIS ATTACHED HANDLER prevents the unhandled rejection.
      },
    );
  });
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
export function createWebBluetoothTransport(): Transport & {
  /** C1 fix (final-review): `subscribe()`'s GATT lookup is async
   *  (`getCharacteristic` below) and `Transport.subscribe` must still
   *  return its unsubscribe closure SYNCHRONOUSLY — so a rejection there
   *  (a firmware missing the characteristic, most namably 0x003F for the
   *  hold-open instrument) used to vanish into a `void`ed promise with no
   *  attached `.catch()` at all: not a throw, not a rejection any caller
   *  could observe, just silence identical to a firmware that has the
   *  characteristic and never sends on it. This is the same structural
   *  `Transport` extension `capacitorBle.ts` already exposes for the
   *  native arm (`onCharacteristicDegraded`) — added here so a rejection
   *  on THIS arm is observable too, fanned out to every registered
   *  listener (a `Set`, not `capacitorBle.ts`'s single-slot pattern —
   *  deliberately, so `useMonitorSession.ts`'s own driver-level
   *  registration and a second caller like `holdOpen.ts`'s instrument can
   *  both register without one silently overwriting the other). */
  onCharacteristicDegraded(
    cb: (characteristicId: string, message: string) => void,
  ): () => void;
} {
  let device: BluetoothDevice | null = null;
  let server: BluetoothRemoteGATTServer | null = null;
  let disconnectCb: ((reason: string) => void) | null = null;
  const characteristics = new Map<string, BluetoothRemoteGATTCharacteristic>();
  // C1 fix (final-review): every listener registered via
  // `onCharacteristicDegraded` below, fired for ANY characteristic's
  // subscribe rejection — see that method's own doc comment for why this
  // is a fan-out `Set`, not a single overwritable slot.
  const degradedCbs = new Set<
    (characteristicId: string, message: string) => void
  >();
  // M-2 (final-review): `Transport.onDisconnect`'s own contract
  // (types.ts:120-125) says it is "never fired by a caller-initiated
  // disconnect()" — but `server.disconnect()` below fires
  // `gattserverdisconnected` on the device just like a real radio drop
  // would, and this file had NO guard against that before this fix, so
  // every deliberate `disconnect()` call would ALSO fire `onDisconnect`,
  // arming a driver's `reconnectPending` after a rower hung up on
  // purpose. Set immediately before the caller-initiated `disconnect()`
  // call, consumed (and reset) the first time the listener runs — a fresh
  // `connect()` also resets it, so a stale `true` can never survive into a
  // NEW connection's own genuine drop.
  let callerInitiatedDisconnect = false;

  function handleGattServerDisconnected(): void {
    if (callerInitiatedDisconnect) {
      callerInitiatedDisconnect = false;
      return;
    }
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
          "webBluetooth: navigator.bluetooth is unavailable. Chromium only (design spec's own research note)",
        );
      }
      // Chrome's picker matches filters against ADVERTISED UUIDs only.
      // Filtering on the rowing service (0x0030) alone left the picker
      // scanning forever against a real PM5 (interface-notes.md §18,
      // 2026-08-05) — that service is not advertised. Both filters below
      // are kept because the observation cannot say which one matched. The
      // rowing service exists on the device but is invisible until after
      // the GATT connection, so filtering on it left the picker scanning
      // forever (interface-notes.md §18, 2026-08-05). The name prefix is a
      // deliberate second filter (filters are OR'd): every PM5 names itself
      // "PM5 <serial>", so discovery survives a firmware revision that
      // changes the advertising set.
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [DEVICE_INFO_SERVICE_UUID] },
          { namePrefix: "PM5" },
        ],
        optionalServices: [
          DEVICE_INFO_SERVICE_UUID,
          CONTROL_SERVICE_UUID,
          ROWING_SERVICE_UUID,
        ],
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
      // A fresh connection never inherits a stale flag from a PRIOR one
      // (M-2's own comment on the variable above).
      callerInitiatedDisconnect = false;
      // Every cached characteristic from a PRIOR connection is dead the
      // moment that connection drops — Chrome invalidates the objects and
      // throws `InvalidStateError: Characteristic ... is no longer valid.
      // Remember to retrieve the characteristic again after reconnecting.`
      // Observed in the first laptop session (interface-notes.md §18,
      // 2026-08-05): after a disconnect/reconnect every write failed on the
      // stale handle, which would have broken the driver's whole reconnect
      // path — the one place `Transport` is REQUIRED to keep working — on
      // real hardware while passing every test in CI. Clearing here (not in
      // `disconnect()`) also covers the drops we never initiated.
      characteristics.clear();
      // Idempotent: a second connect() on the same device would otherwise
      // stack a duplicate listener and fire `onDisconnect` twice per drop.
      device.removeEventListener(
        "gattserverdisconnected",
        handleGattServerDisconnected,
      );
      device.addEventListener(
        "gattserverdisconnected",
        handleGattServerDisconnected,
      );
      server = await raceConnectTimeout(
        device.gatt.connect(),
        device.gatt,
        () => {
          callerInitiatedDisconnect = true;
        },
      );
    },

    // L-7 (final-review): prefers `writeValueWithoutResponse` with no
    // citation and no §17 runsheet item before this fix — for a multi-chunk
    // CSAFE frame (`pm5/commands.ts`'s chunked writes) this is the riskiest
    // available choice: every 20-byte chunk is written back-to-back with no
    // per-chunk ack, and `writeValueWithoutResponse` resolves on QUEUE, not
    // delivery, so a dropped chunk would silently corrupt the frame with no
    // signal at this layer. Kept (not switched to the always-acked
    // `writeValue`) because neither source document states which the PM5
    // expects or tolerates — an untested radio-behaviour assumption of
    // exactly the class docs/monitor/pm5-interface-notes.md §17 exists to
    // collect; flagged there (item 10) rather than guessed at here.
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
      //
      // C1 fix (final-review): the `.catch()` below is the whole fix — its
      // ABSENCE before this change is exactly what made a rejection here
      // (a firmware lacking `characteristicId`) indistinguishable from a
      // firmware that has it and simply never sends. `cancelled` is
      // checked the same way the `.then()` above already does: a caller
      // who unsubscribed before the lookup settled gets no degraded
      // report either — it asked to stop hearing about this
      // characteristic, failure included.
      void getCharacteristic(characteristicId)
        .then((characteristic) => {
          if (cancelled) return;
          subscribed = characteristic;
          characteristic.addEventListener(
            "characteristicvaluechanged",
            listener,
          );
          void characteristic.startNotifications();
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : String(err);
          for (const cb of degradedCbs) cb(characteristicId, message);
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
      // Only arm the guard when there's actually a live server to drop —
      // calling this with nothing connected fires no
      // `gattserverdisconnected` event at all, so there is nothing to
      // suppress (`connect()` also resets the flag on its own, so a stale
      // `true` can never leak into a later connection either way).
      if (server) callerInitiatedDisconnect = true;
      server?.disconnect();
    },

    onDisconnect(cb: (reason: string) => void): () => void {
      disconnectCb = cb;
      return () => {
        if (disconnectCb === cb) disconnectCb = null;
      };
    },

    // C1 fix (final-review): see the returned object's own doc comment
    // above for why this is a fan-out `Set` rather than a single slot.
    onCharacteristicDegraded(
      cb: (characteristicId: string, message: string) => void,
    ): () => void {
      degradedCbs.add(cb);
      return () => {
        degradedCbs.delete(cb);
      };
    },
  };
}
