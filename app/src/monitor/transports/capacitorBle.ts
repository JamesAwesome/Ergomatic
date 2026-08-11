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
// in this file or its test suite may claim to test real radio behavior.
// What the suite DOES pin (phone-BLE spec §9's row for this file) is the
// half that is ours rather than the radio's: the request options we
// build, the order we build them in, the timeout race AND ITS SCOPE (a
// hang at ANY pipeline step, not merely at the picker call — REVIEW I6's
// own regression), the plugin prose we translate, the memo, the
// subscribe route. Two requirements stay
// beyond any mock and live as comments below instead — the no-double-init
// rule (REVIEW B2) and the BleClient queue invariant (REVIEW B3.3).

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

// The whole scan pipeline is raced against this, not just `requestDevice`
// (spec §3.3, REVIEW I6): `initialize()` settles NOTHING on a `.resetting`
// or `.unknown` central (`DeviceManager.swift:58-59`, `:66-67`), so a race
// scoped to the plugin's picker call would let `picking` hang with no
// sheet ever drawn.
const SCAN_TIMEOUT_MS = 35_000;

// Spec §7, verbatim. House copy: no em-dash. `noDeviceFound` names Cancel
// because Cancel is the sheet's only control once the plugin's own 30s
// scan has stopped (REVIEW M4).
const DISPLAY_STRINGS = {
  scanning: "Looking for your PM5",
  availableDevices: "Choose your monitor",
  noDeviceFound:
    "No monitor found. Wake the PM5, then tap Cancel and try again.",
  cancel: "Cancel",
} as const;

// The failure vocabulary travels by NAME (spec §3.4). The classifier
// upstairs keys on `err.name` and never imports from this file — the
// layering rule that keeps a radio adapter out of the hook's import graph.
class BluetoothOffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BluetoothOffError";
  }
}

class BluetoothPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BluetoothPermissionError";
  }
}

class ScanTimeoutError extends Error {
  constructor() {
    // Derived, so the diagnostic can never drift from the constant.
    super(
      `The scan pipeline did not settle within ${SCAN_TIMEOUT_MS / 1000}s.`,
    );
    this.name = "ScanTimeoutError";
  }
}

/** Plugin prose in, our vocabulary out. POSITIVE MATCHES ONLY (REVIEW I1):
 *  `initialize()` rejects with exactly two strings — `"BLE permission
 *  denied"` for both `.unauthorized` cases, denied AND restricted
 *  (`DeviceManager.swift:60-62`), and `"BLE unsupported"`
 *  (`DeviceManager.swift:63-65`). Anything else falls through UNTYPED on
 *  purpose: the Capacitor bridge's own `"BluetoothLe" plugin is not
 *  implemented on ios` is a wiring defect, and it must surface as a link
 *  failure rather than wear the permission card. */
function translateInitializeFailure(err: unknown): unknown {
  const message = err instanceof Error ? err.message : String(err);
  if (/permission denied/i.test(message)) {
    return new BluetoothPermissionError(message);
  }
  // Simulator / no BLE hardware: the nearest honest surface we have.
  // "powered off" in the message is what routes it to `bluetooth-off` in
  // `mapRadioFailure`'s existing regex arm.
  if (/unsupported/i.test(message)) {
    return new BluetoothOffError(
      `Bluetooth is powered off or unsupported (${message}).`,
    );
  }
  return err;
}

/** Races the scan pipeline against `SCAN_TIMEOUT_MS`, handling BOTH
 *  outcomes of the abandoned loser explicitly (spec §3.3).
 *  `Promise.race` would not do: it leaves the loser's late rejection
 *  unhandled, so the rower's eventual Cancel tap
 *  (`"requestDevice cancelled."`) fires `unhandledrejection` inside the
 *  WKWebView (REVIEW B3.2). A late RESOLUTION has to be dropped too
 *  (REVIEW I4): rows stay tappable after the plugin's own 30s scan stop
 *  (`DeviceManager.swift:195-210`), so a rower can pick their PM5 at
 *  t=36s. Dropping that pick is safe — `requestDevice` only PICKS, no
 *  connect was issued, and the retry card the rower is looking at scans
 *  fresh.
 *
 *  About the `settled` flag: it is INTENT-DOCUMENTATION on all three
 *  arms, not an observable guard, and no test covers it — because none
 *  can. The outer promise itself enforces at-most-one settle (a second
 *  `resolve`/`reject` on a settled promise is a no-op), the timer is
 *  always cleared before either late arm runs, and what actually
 *  prevents the unhandled rejection is the ATTACHED handler, not the
 *  flag. It stays because it makes the at-most-one-settle intent legible
 *  at the seam where a future edit — a log line, a metric, an
 *  `onScanAbandoned` hook — would make it load-bearing overnight. */
function raceScanTimeout<T>(pipeline: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new ScanTimeoutError());
      }
    }, SCAN_TIMEOUT_MS);
    pipeline.then(
      (value) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve(value);
        }
        // Else: a late pick, deliberately dropped (REVIEW I4) — dropped
        // by the settled promise itself; the flag only says so out loud.
      },
      (err: unknown) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(err);
        }
        // Else: the rower's eventual Cancel, deliberately swallowed.
        // THIS ATTACHED HANDLER — not the flag — is the
        // no-unhandledrejection guarantee; mutating it is what turns the
        // suite red.
      },
    );
  });
}

/**
 * Builds a `Transport` backed by `@capacitor-community/bluetooth-le`'s
 * module-level `BleClient`. `scan()` does not open an OS picker: the
 * plugin draws its OWN in-process list sheet (`displayMode: 'list'`,
 * `DeviceListView.swift`) carrying our copy from `setDisplayStrings`
 * (spec §7), and the sheet is modal (`isModalInPresentation`) — nothing
 * of ours is reachable while it is up. The filter is the DEVICE NAME
 * only, never a service UUID (spec §3.1): the rowing service 0x0030 is
 * not advertised (`docs/monitor/pm5-interface-notes.md:4319-4321`, the
 * same lesson `webBluetooth.ts:181-202` carries) and this plugin ANDs
 * `services` with `namePrefix` down at CoreBluetooth, so a service filter
 * here makes the PM5 undiscoverable. The single-result shape still
 * matches `webBluetooth.ts`'s, so callers above `Transport` see one
 * consistent picker-style flow regardless of which adapter is live.
 * `write`/`subscribe` both throw synchronously (via `serviceFor`) on an
 * unrecognized characteristic id or a call before `connect()` — a
 * programming error in the caller, not a runtime radio condition, so
 * failing loudly beats a silent no-op.
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
  let initPromise: Promise<void> | null = null;

  // NOT idempotent upstream (spec §3.5, REVIEW B2): every
  // `BleClient.initialize()` constructs a new `DeviceManager`
  // (`Plugin.swift:62-72`) and with it a new `CBCentralManager`
  // (`DeviceManager.swift:35-41`), so a scan->connect double-init hands
  // the picked `CBPeripheral` to a central that never discovered it —
  // cross-central use CoreBluetooth does not define. Memoize the
  // in-flight/settled success; CLEAR the memo on rejection so a
  // denied-then-re-allowed rower gets a fresh prompt path instead of a
  // cached refusal. A mocked `BleClient` cannot catch a regression here
  // (it hides the manager swap entirely) — this comment, the spec §, and
  // the review checklist are where the requirement lives; the test suite
  // can only pin the call COUNT.
  function ensureInitialized(): Promise<void> {
    initPromise ??= BleClient.initialize().catch((err: unknown) => {
      initPromise = null;
      throw translateInitializeFailure(err);
    });
    return initPromise;
  }

  function requireConnected(characteristicId: string): {
    id: string;
    service: string;
  } {
    if (deviceId === null) {
      throw new Error("capacitorBle: write/subscribe called before connect()");
    }
    return { id: deviceId, service: serviceFor(characteristicId) };
  }

  /** Live Transport subscribers per characteristic — the fan-out registry
   *  behind `subscribe()`'s multiplexing (see the walk-1 comment there).
   *  Cleared on every fresh `connect()`: a new link starts with no
   *  subscriptions, and a stale set must never receive the new
   *  connection's frames. */
  const subscribers = new Map<string, Set<(bytes: Uint8Array) => void>>();

  function makeUnsubscribe(
    characteristicId: string,
    cb: (bytes: Uint8Array) => void,
    id: string,
    service: string,
  ): () => void {
    return () => {
      const set = subscribers.get(characteristicId);
      // Idempotent: a second call (or one after connect() reset the
      // registry) finds nothing to remove and must not touch the plugin.
      if (set === undefined || !set.delete(cb)) return;
      if (set.size === 0) {
        subscribers.delete(characteristicId);
        void BleClient.stopNotifications(id, service, characteristicId);
      }
    };
  }

  function handleDisconnect(disconnectedId: string): void {
    if (callerInitiatedDisconnect) {
      callerInitiatedDisconnect = false;
      return;
    }
    disconnectCb?.(`capacitorBle: device ${disconnectedId} disconnected`);
  }

  return {
    // THE QUEUE INVARIANT (spec §3.3, REVIEW B3.3): `BleClient` serializes
    // EVERY call through one promise queue (`bleClient.js`'s constructor,
    // `queue.js`), and after a `ScanTimeoutError` the NATIVE
    // `requestDevice` is still pending — the sheet is modal and no API
    // dismisses it, only the rower's Cancel or a row tap does. So any
    // BleClient call issued in that window silently waits behind the
    // sheet, forever if the rower walks away. NO BleClient CALL MAY BE
    // ISSUED BETWEEN `ScanTimeoutError` AND THE SHEET'S DISMISSAL. The
    // timeout path conforms today because `disconnect()` below no-ops on
    // `deviceId === null`; that is now deliberate, not luck. Mocks cannot
    // see the queue, so no test guards this — new code in the `picking`
    // phase gets read against this comment.
    async scan(): Promise<DiscoveredMonitor[]> {
      // Order is load-bearing, not style (REVIEW I2): `isEnabled` REJECTS
      // if ever called uninitialized (`Plugin.swift:74-80`, `:598-604`)
      // with a message no classifier arm matches, and `initialize`
      // RESOLVES when the radio is off (`DeviceManager.swift:54-56`) — so
      // `isEnabled` AFTER `ensureInitialized` is the only Bluetooth-off
      // detector this path has.
      const pipeline = (async (): Promise<DiscoveredMonitor[]> => {
        await ensureInitialized();
        if (!(await BleClient.isEnabled())) {
          throw new BluetoothOffError("Bluetooth is powered off.");
        }
        await BleClient.setDisplayStrings(DISPLAY_STRINGS);
        const device = await BleClient.requestDevice({
          // No `services` key: 0x0030 is not advertised and the plugin
          // ANDs `services` with `namePrefix` at CoreBluetooth (spec
          // §3.1, and the factory doc above). An absent key reaches
          // `scanForPeripherals` as an EMPTY array, i.e. scan-all
          // (`Plugin.swift:606-612`) — the plugin's universal name-only
          // pattern, though not Apple-documented; walk step 2 settles it.
          optionalServices: [CONTROL_SERVICE_UUID, ROWING_SERVICE_UUID],
          namePrefix: "PM5",
          displayMode: "list",
        }).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          if (/cancel/i.test(message)) {
            // The ONE place plugin prose is read, quarantined here (spec
            // §3.4) and re-thrown in the web picker's own cancel
            // vocabulary, which the classifier already sorts.
            const cancelled = new Error(message);
            cancelled.name = "NotFoundError";
            throw cancelled;
          }
          throw err;
        });
        return [{ id: device.deviceId, name: device.name ?? "PM5" }];
      })();
      return raceScanTimeout(pipeline);
    },

    async connect(id: string): Promise<void> {
      // A fresh connection never inherits a stale flag from a PRIOR one
      // (M-2's own comment on the variable above), nor stale subscribers
      // (the fan-out registry's own comment).
      callerInitiatedDisconnect = false;
      subscribers.clear();
      // `connect()` no longer assumes `scan()` ran first (spec §3.5): a
      // reconnect path calls it cold. Memoized, so the normal
      // scan->connect flow still initializes exactly once.
      await ensureInitialized();
      await BleClient.connect(id, handleDisconnect);
      deviceId = id;
    },

    // RECORDED DIVERGENCE (spec §1's non-goals): this is an ACKED write
    // where `webBluetooth.ts` writes without response. The two transports
    // are deliberately not unified this phase; revisited only if the
    // hardware walk shows chunked-CSAFE failures.
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
      // ONE plugin subscription per characteristic, MANY Transport
      // subscribers (walk-1 finding, 2026-08-10): the plugin keeps a
      // single listener per characteristic key — a second
      // `startNotifications` REMOVES the first listener before adding its
      // own (`bleClient.js:293`, `eventListeners.get(key)?.remove()`) —
      // where Web Bluetooth stacks `characteristicvaluechanged` listeners.
      // The driver legitimately subscribes 0x0031 twice (its startup
      // status loop and the program-phase watcher), so without this
      // fan-out the second subscribe silently unplugs the first: frames
      // flow into the transport and the state machine never hears them,
      // the exact stuck-at-"sending the workout" hang the walk hit. The
      // transport therefore multiplexes: the first subscriber opens the
      // plugin subscription, the dispatcher fans out to every live
      // callback, the last unsubscribe closes it.
      const existing = subscribers.get(characteristicId);
      if (existing !== undefined) {
        existing.add(cb);
        return makeUnsubscribe(characteristicId, cb, id, service);
      }
      const set = new Set<(bytes: Uint8Array) => void>([cb]);
      subscribers.set(characteristicId, set);
      // Registration is asynchronous where this `Transport.subscribe`
      // signature is synchronous — `startNotifications` resolves well
      // after this function must already have returned an unsubscribe
      // closure — but the rejection is NOT discarded any more (spec §3.5,
      // REVIEW I5).
      BleClient.startNotifications(id, service, characteristicId, (value) => {
        const bytes = toUint8Array(value);
        // Never hand the reassembler a manufactured empty frame: a
        // zero-length "packet" is a decode the wire never sent.
        if (bytes === undefined) return;
        // Snapshot so an unsubscribe during fan-out can't mutate mid-walk.
        for (const fn of [...set]) fn(bytes);
      }).catch((err: unknown) => {
        // A dead subscription IS a dead link for this driver: the plugin
        // rejects on a missing service/characteristic
        // (`Plugin.swift:544-565`), CSAFE responses can then never
        // arrive, and the silent alternative is the driver waiting below
        // its ready gate forever — the hang class ruling 2 exists to
        // kill. Routing it through `onDisconnect` ends the session
        // `link-failed` instead. The M-2 guard is CHECKED, not consumed:
        // a subscription failure racing a deliberate teardown stays
        // quiet, and the real disconnect callback still gets its flag.
        // The plugin call exists only on the FIRST subscriber's path, so
        // one failure fires one link-drop for every joined callback —
        // which is the truth: they all share the dead subscription.
        if (callerInitiatedDisconnect) return;
        const message = err instanceof Error ? err.message : String(err);
        disconnectCb?.(
          `capacitorBle: subscription to ${characteristicId} failed: ${message}`,
        );
      });
      return makeUnsubscribe(characteristicId, cb, id, service);
    },

    async disconnect(): Promise<void> {
      if (deviceId !== null) {
        callerInitiatedDisconnect = true;
        const id = deviceId;
        // Nulled BEFORE the await so the queue invariant holds inside the
        // transport itself, not only via the hook's fresh-instance-per-
        // connect pattern: a reused instance's post-timeout disconnect()
        // must no-op rather than queue a BleClient call behind a pending
        // sheet (final review, minor 2 — load-bearing once reconnect
        // reuses instances).
        deviceId = null;
        await BleClient.disconnect(id);
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
