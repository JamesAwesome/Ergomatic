import { beforeEach, describe, expect, it, vi } from "vitest";

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
//
// Phone-BLE phase (spec `2026-08-10-phone-ble-design.md` §3, §9's row for
// this file): the same reasoning extends to every OTHER seam that is
// OURS rather than the radio's — the request options we build, the order
// we build them in, the timeout race we own, the plugin prose we
// translate, the memo we keep. Those are all pinned below. Two
// requirements deliberately are NOT tested, because a mocked `BleClient`
// structurally cannot see them, and pretending otherwise would be the
// "passes against broken code" defect this repo keeps paying for:
//   1. the no-double-init requirement (REVIEW B2) — the mock hides
//      `DeviceManager`/`CBCentralManager` replacement entirely. The
//      call-count tests below pin the OBSERVABLE half (one `initialize`
//      across scan→connect); the reason it matters lives in the source
//      comment and the review checklist.
//   2. the queue invariant (REVIEW B3.3) — `BleClient` serializes every
//      call through one promise queue, which the mock does not model.
//      Source comment beside `scan()`.
//
// Unhandled-rejection strategy (spec §3.3, REVIEW B3.2): the abandoned
// pipeline's late settle must not leak. An explicit
// `process.on("unhandledRejection")` spy is flaky under vitest's own
// handler, so the tests below assert the POSTCONDITION (the scan already
// rejected `ScanTimeoutError`; flushing the late settle changes nothing
// observable) and lean on vitest's default unhandled-rejection behavior:
// a leaked rejection FAILS the suite. Delete the attached handlers in
// `raceScanTimeout` and these tests go red for that reason.
const handlers = new Map<string, (id: string) => void>();

vi.mock("@capacitor-community/bluetooth-le", () => ({
  BleClient: {
    initialize: vi.fn(),
    isEnabled: vi.fn(),
    setDisplayStrings: vi.fn(),
    requestDevice: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    write: vi.fn(),
    startNotifications: vi.fn(),
    stopNotifications: vi.fn(),
  },
  numbersToDataView: vi.fn(),
  toUint8Array: vi.fn(),
}));

const { BleClient, toUint8Array } =
  await import("@capacitor-community/bluetooth-le");
const { GENERAL_STATUS_UUID, ROWING_SERVICE_UUID } =
  await import("../../../domain/monitor/pm5/uuids.js");
const { createCapacitorBleTransport } = await import("./capacitorBle");

/** The default happy-path radio. Every mock is re-armed here so a
 *  per-test override (a rejection, a never-settling promise) can never
 *  leak into the next test. */
beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  vi.mocked(BleClient.initialize).mockResolvedValue(undefined);
  vi.mocked(BleClient.isEnabled).mockResolvedValue(true);
  vi.mocked(BleClient.setDisplayStrings).mockResolvedValue(undefined);
  vi.mocked(BleClient.requestDevice).mockResolvedValue({
    deviceId: "d1",
    name: "PM5 431910706",
  });
  vi.mocked(BleClient.connect).mockImplementation(
    (id: string, onDisconnect?: (id: string) => void) => {
      if (onDisconnect) handlers.set(id, onDisconnect);
      return Promise.resolve();
    },
  );
  vi.mocked(BleClient.disconnect).mockImplementation((id: string) => {
    // The real library's own documented behavior (M-2's finding): calling
    // disconnect() invokes the SAME callback `connect()` registered, with
    // no distinction from an unexpected drop.
    handlers.get(id)?.(id);
    return Promise.resolve();
  });
  vi.mocked(BleClient.write).mockResolvedValue(undefined);
  vi.mocked(BleClient.startNotifications).mockResolvedValue(undefined);
  vi.mocked(BleClient.stopNotifications).mockResolvedValue(undefined);
});

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

describe("scan(): the pipeline and its filter (spec §3.1-§3.3)", () => {
  it("requestDevice gets namePrefix and displayMode:'list' and NO services key", async () => {
    const transport = createCapacitorBleTransport();

    const found = await transport.scan();

    const opts = vi.mocked(BleClient.requestDevice).mock.calls[0]?.[0];
    expect(opts).toBeDefined();
    // 0x0030 is not advertised (interface-notes.md §18, 2026-08-05) and the
    // plugin ANDs `services` with `namePrefix` down at CoreBluetooth, so a
    // `services` key can only make the PM5 undiscoverable (spec §3.1).
    expect(opts).not.toHaveProperty("services");
    expect(opts?.namePrefix).toBe("PM5");
    expect(opts?.displayMode).toBe("list");
    expect(opts?.optionalServices).toContain(ROWING_SERVICE_UUID);
    expect(found).toStrictEqual([{ id: "d1", name: "PM5 431910706" }]);
  });

  it("display strings are passed once, with the spec §7 values verbatim", async () => {
    const transport = createCapacitorBleTransport();

    await transport.scan();

    expect(BleClient.setDisplayStrings).toHaveBeenCalledTimes(1);
    expect(BleClient.setDisplayStrings).toHaveBeenCalledWith({
      scanning: "Looking for your PM5",
      availableDevices: "Choose your monitor",
      noDeviceFound:
        "No monitor found. Wake the PM5, then tap Cancel and try again.",
      cancel: "Cancel",
    });
  });

  it("pipeline order: initialize, then isEnabled, then setDisplayStrings, then requestDevice", async () => {
    // Load-bearing, not style (REVIEW I2): isEnabled REJECTS if called
    // uninitialized, and initialize RESOLVES when the radio is off — so
    // isEnabled after initialize is the ONLY Bluetooth-off detector.
    const order: string[] = [];
    vi.mocked(BleClient.initialize).mockImplementation(() => {
      order.push("initialize");
      return Promise.resolve();
    });
    vi.mocked(BleClient.isEnabled).mockImplementation(() => {
      order.push("isEnabled");
      return Promise.resolve(true);
    });
    vi.mocked(BleClient.setDisplayStrings).mockImplementation(() => {
      order.push("setDisplayStrings");
      return Promise.resolve();
    });
    vi.mocked(BleClient.requestDevice).mockImplementation(() => {
      order.push("requestDevice");
      return Promise.resolve({ deviceId: "d1", name: "PM5 431910706" });
    });
    const transport = createCapacitorBleTransport();

    await transport.scan();

    expect(order).toStrictEqual([
      "initialize",
      "isEnabled",
      "setDisplayStrings",
      "requestDevice",
    ]);
  });

  it("isEnabled false throws BluetoothOffError whose message contains 'powered off'", async () => {
    vi.mocked(BleClient.isEnabled).mockResolvedValue(false);
    const transport = createCapacitorBleTransport();

    await expect(transport.scan()).rejects.toMatchObject({
      name: "BluetoothOffError",
      message: expect.stringMatching(/powered off/i) as unknown as string,
    });
    // The sheet never opens on an off radio.
    expect(BleClient.requestDevice).not.toHaveBeenCalled();
  });
});

/** Attaches a handler to `scan()`'s promise IMMEDIATELY — before any
 *  timer advance — and reports whatever it settles with. A bare
 *  `expect(...).rejects` assertion held across `advanceTimersByTimeAsync`
 *  is what `vitest/valid-expect` forbids, and awaiting it first would
 *  deadlock the timers, so the settle is captured by hand. */
function settled(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    (value) => value,
    (err: unknown) => err,
  );
}

describe("scan(): timeout race (spec §3.3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    return () => {
      vi.useRealTimers();
    };
  });

  it("a pipeline that never settles rejects ScanTimeoutError at 35s", async () => {
    vi.mocked(BleClient.requestDevice).mockImplementation(
      () => new Promise(() => {}),
    );
    const transport = createCapacitorBleTransport();

    const outcome = settled(transport.scan());
    // Nothing fires a moment early.
    await vi.advanceTimersByTimeAsync(34_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(await outcome).toMatchObject({ name: "ScanTimeoutError" });
  });

  it("a LATE REJECTION after the timeout is swallowed (no unhandledrejection)", async () => {
    let rejectRequest: ((err: unknown) => void) | undefined;
    vi.mocked(BleClient.requestDevice).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    const transport = createCapacitorBleTransport();

    const outcome = settled(transport.scan());
    await vi.advanceTimersByTimeAsync(35_000);
    expect(await outcome).toMatchObject({ name: "ScanTimeoutError" });

    // The rower finally taps the sheet's own Cancel, long after the race
    // was lost. The plugin's real cancellation string (spec §3.4).
    rejectRequest?.(new Error("requestDevice cancelled."));
    await vi.advanceTimersByTimeAsync(0);

    // Nothing further is observable, and no rejection escaped: an
    // unhandled one fails this suite by vitest's own default.
    expect(BleClient.connect).not.toHaveBeenCalled();
  });

  it("a LATE RESOLUTION after the timeout is swallowed — no device is adopted", async () => {
    let resolveRequest: ((device: { deviceId: string }) => void) | undefined;
    vi.mocked(BleClient.requestDevice).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const transport = createCapacitorBleTransport();

    const outcome = settled(transport.scan());
    await vi.advanceTimersByTimeAsync(35_000);
    expect(await outcome).toMatchObject({ name: "ScanTimeoutError" });

    // The rower picks a stale row at t=36s (REVIEW I4: rows stay tappable
    // after the plugin's own 30s scan stop).
    resolveRequest?.({ deviceId: "late-pick" });
    await vi.advanceTimersByTimeAsync(0);

    // requestDevice only PICKS — no connect was ever issued, so dropping
    // the late pick is safe, and nothing adopts "late-pick".
    expect(BleClient.connect).not.toHaveBeenCalled();
  });

  it("a pipeline that settles in time clears the timer (no stray rejection later)", async () => {
    const transport = createCapacitorBleTransport();

    const found = await transport.scan();

    expect(found).toStrictEqual([{ id: "d1", name: "PM5 431910706" }]);
    // The 35s timer is gone the moment the pipeline wins: a left-running
    // timer would fire into an already-settled promise for every scan of
    // the session.
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
  });
});

describe("scan(): error translation (spec §3.4)", () => {
  it("'requestDevice cancelled.' becomes name NotFoundError", async () => {
    vi.mocked(BleClient.requestDevice).mockRejectedValue(
      new Error("requestDevice cancelled."),
    );
    const transport = createCapacitorBleTransport();

    await expect(transport.scan()).rejects.toMatchObject({
      name: "NotFoundError",
      message: "requestDevice cancelled.",
    });
  });

  it("initialize rejecting 'BLE permission denied' becomes BluetoothPermissionError", async () => {
    // The REAL string, both `.unauthorized` cases (DeviceManager.swift:60-62).
    vi.mocked(BleClient.initialize).mockRejectedValue(
      new Error("BLE permission denied"),
    );
    const transport = createCapacitorBleTransport();

    await expect(transport.scan()).rejects.toMatchObject({
      name: "BluetoothPermissionError",
      message: "BLE permission denied",
    });
  });

  it("initialize rejecting 'BLE unsupported' becomes BluetoothOffError (message contains 'powered off')", async () => {
    vi.mocked(BleClient.initialize).mockRejectedValue(
      new Error("BLE unsupported"),
    );
    const transport = createCapacitorBleTransport();

    await expect(transport.scan()).rejects.toMatchObject({
      name: "BluetoothOffError",
      message: expect.stringMatching(/powered off/i) as unknown as string,
    });
  });

  it("an UNRECOGNIZED initialize rejection passes through untyped", async () => {
    // The §8 wiring failure must surface as a link failure, never wearing
    // the permission card (REVIEW I1) — spec §3.4's deliberate fall-through.
    const wiringFailure = new Error(
      '"BluetoothLe" plugin is not implemented on ios',
    );
    vi.mocked(BleClient.initialize).mockRejectedValue(wiringFailure);
    const transport = createCapacitorBleTransport();

    await expect(transport.scan()).rejects.toBe(wiringFailure);
    expect(wiringFailure.name).toBe("Error");
  });
});

describe("ensureInitialized (spec §3.5, REVIEW B2)", () => {
  it("scan then connect initializes exactly once", async () => {
    const transport = createCapacitorBleTransport();

    await transport.scan();
    await transport.connect("d1");

    // A second initialize would build a second CBCentralManager and hand
    // it a peripheral the FIRST central discovered (REVIEW B2). The mock
    // cannot see that; the call count is the observable half.
    expect(BleClient.initialize).toHaveBeenCalledTimes(1);
  });

  it("connect() without a prior scan() initializes", async () => {
    const transport = createCapacitorBleTransport();

    await transport.connect("d1");

    expect(BleClient.initialize).toHaveBeenCalledTimes(1);
    expect(BleClient.connect).toHaveBeenCalledTimes(1);
  });

  it("the memo clears on rejection: a denied scan then a second scan calls initialize twice", async () => {
    vi.mocked(BleClient.initialize).mockRejectedValueOnce(
      new Error("BLE permission denied"),
    );
    const transport = createCapacitorBleTransport();

    await expect(transport.scan()).rejects.toMatchObject({
      name: "BluetoothPermissionError",
    });
    // A denied-then-re-allowed rower must get a fresh prompt path, not a
    // cached rejection forever.
    await expect(transport.scan()).resolves.toStrictEqual([
      { id: "d1", name: "PM5 431910706" },
    ]);
    expect(BleClient.initialize).toHaveBeenCalledTimes(2);
  });
});

describe("subscribe hardening (spec §3.5)", () => {
  it("a startNotifications rejection fires onDisconnect (M-2 guard untripped)", async () => {
    vi.mocked(BleClient.startNotifications).mockRejectedValue(
      new Error("Service not found."),
    );
    const transport = createCapacitorBleTransport();
    const drops: string[] = [];
    transport.onDisconnect((reason) => drops.push(reason));
    await transport.connect("d1");

    transport.subscribe(GENERAL_STATUS_UUID, () => {});
    await Promise.resolve();
    await Promise.resolve();

    // A dead subscription IS a dead link for this driver: CSAFE responses
    // can never arrive, and silence is the ready-gate hang ruling 2 kills.
    expect(drops).toHaveLength(1);
    expect(drops[0]).toContain(GENERAL_STATUS_UUID);
    expect(drops[0]).toContain("Service not found.");
  });

  it("a startNotifications rejection during a caller-initiated teardown is NOT fired", async () => {
    let rejectSubscription: ((err: unknown) => void) | undefined;
    vi.mocked(BleClient.startNotifications).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectSubscription = reject;
        }),
    );
    // Models the plugin's disconnect callback arriving LATER than the
    // disconnect() promise, so the caller-initiated guard is still armed
    // while the subscription failure lands.
    vi.mocked(BleClient.disconnect).mockResolvedValue(undefined);
    const transport = createCapacitorBleTransport();
    const drops: string[] = [];
    transport.onDisconnect((reason) => drops.push(reason));
    await transport.connect("d1");
    transport.subscribe(GENERAL_STATUS_UUID, () => {});

    await transport.disconnect();
    rejectSubscription?.(new Error("Service not found."));
    await Promise.resolve();
    await Promise.resolve();

    expect(drops).toStrictEqual([]);
    // The guard was CHECKED, not consumed: the real disconnect callback,
    // whenever it arrives, is still the one that clears it.
    handlers.get("d1")?.("d1");
    expect(drops).toStrictEqual([]);
  });

  it("a notification whose toUint8Array returns undefined is dropped, not delivered empty", async () => {
    const transport = createCapacitorBleTransport();
    await transport.connect("d1");
    const frames: Uint8Array[] = [];
    transport.subscribe(GENERAL_STATUS_UUID, (bytes) => frames.push(bytes));
    const notify = vi.mocked(BleClient.startNotifications).mock.calls[0]?.[3];
    expect(notify).toBeDefined();

    vi.mocked(toUint8Array).mockReturnValue(
      undefined as unknown as Uint8Array<ArrayBuffer>,
    );
    notify?.(new DataView(new ArrayBuffer(0)));

    // Never feed the reassembler a manufactured empty frame (SCOUT #12).
    expect(frames).toHaveLength(0);

    // The same callback still delivers a REAL frame.
    const real = new Uint8Array([1, 2, 3]);
    vi.mocked(toUint8Array).mockReturnValue(
      real as unknown as Uint8Array<ArrayBuffer>,
    );
    notify?.(new DataView(new ArrayBuffer(3)));
    expect(frames).toStrictEqual([real]);
  });
});
