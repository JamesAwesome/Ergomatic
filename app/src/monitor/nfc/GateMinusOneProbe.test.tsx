import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  reassembleGateReceiptFrames,
  type NfcGateReceiptV1,
} from "./gateMinusOneReceipt";

type NfcListener = (event: unknown) => void;
type BleListener = (event: unknown) => void;
type AppListener = (state: { isActive: boolean }) => void;

const native = vi.hoisted(() => ({
  calls: [] as string[],
  starts: [] as Array<Record<string, unknown>>,
  nfcEvent: undefined as NfcListener | undefined,
  nfcSessionEnd: undefined as NfcListener | undefined,
  bleResult: undefined as BleListener | undefined,
  appResume: undefined as AppListener | undefined,
  appActivity: undefined as AppListener | undefined,
  appPause: undefined as AppListener | undefined,
  stoppedBle: false,
  matchingIds: new Set<string>(),
  waits: new Map<string, Promise<void>>(),
  removed: [] as string[],
  progress: undefined as NfcListener | undefined,
  supported: true,
  enabled: true,
  foreground: true,
  nextId: 0,
  reset() {
    this.calls.length = 0;
    this.starts.length = 0;
    this.nfcEvent = undefined;
    this.nfcSessionEnd = undefined;
    this.bleResult = undefined;
    this.appResume = undefined;
    this.appActivity = undefined;
    this.appPause = undefined;
    this.stoppedBle = false;
    this.matchingIds.clear();
    this.waits.clear();
    this.removed.length = 0;
    this.progress = undefined;
    this.supported = true;
    this.enabled = true;
    this.foreground = true;
    this.nextId = 0;
  },
}));

vi.mock("@capgo/capacitor-nfc", () => ({
  CapacitorNfc: {
    isSupported: async () => {
      native.calls.push("nfc-capability");
      await native.waits.get("capability");
      return { supported: native.supported };
    },
    addListener: async (name: string, listener: NfcListener) => {
      native.calls.push(`nfc-listener:${name}`);
      if (name === "nfcEvent") native.nfcEvent = listener;
      if (name === "nfcSessionEnd") native.nfcSessionEnd = listener;
      await native.waits.get(name);
      return {
        remove: async () => {
          native.removed.push(name);
          await native.waits.get(`remove:${name}`);
          if (name === "nfcSessionEnd")
            native.calls.push("nfc-listeners-removed");
        },
      };
    },
    startScanning: async (options: { attemptId: string }) => {
      native.starts.push(options);
      native.calls.push(`nfc-start:${options.attemptId}`);
      await native.waits.get("nfc-start");
    },
    stopScanning: async (options: { attemptId: string }) => {
      native.calls.push(`nfc-stop:${options.attemptId}`);
      await native.waits.get("nfc-stop");
    },
  },
}));

vi.mock("@capacitor-community/bluetooth-le", () => ({
  BleClient: {
    initialize: async () => {
      native.calls.push("ble-initialize");
      await native.waits.get("ble-initialize");
    },
    isEnabled: async () => {
      native.calls.push("ble-enabled");
      await native.waits.get("ble-enabled");
      return native.enabled;
    },
    requestLEScan: async (
      options: { allowDuplicates: boolean },
      listener: BleListener,
    ) => {
      native.calls.push(
        `ble-requestLEScan:unfiltered:${options.allowDuplicates ? "duplicates" : "single"}`,
      );
      native.bleResult = listener;
      await native.waits.get("ble-start");
    },
    stopLEScan: async () => {
      native.calls.push("ble-stopLEScan");
      native.stoppedBle = true;
      await native.waits.get("ble-stop");
    },
    connect: async (deviceId: string) => {
      native.calls.push(`ble-connect:${deviceId}`);
      await native.waits.get("ble-connect");
    },
    disconnect: async (deviceId: string) => {
      native.calls.push(`ble-disconnect:${deviceId}`);
      await native.waits.get("ble-disconnect");
    },
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (name: string, listener: AppListener) => {
      if (!native.calls.includes("app-listener"))
        native.calls.push("app-listener");
      if (name === "pause") native.appPause = listener;
      if (name === "resume") native.appResume = listener;
      if (name === "appStateChange") {
        native.calls.push("app-activity-listener");
        native.appActivity = listener;
      }
      await native.waits.get(name);
      return {
        remove: async () => {
          native.removed.push(name);
          await native.waits.get(`remove:${name}`);
        },
      };
    },
    getState: async () => {
      native.calls.push("app-state:active-query");
      const isActive = native.foreground;
      await native.waits.get("app-state");
      return { isActive };
    },
  },
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({
    addListener: async (_name: string, listener: NfcListener) => {
      native.calls.push("progress-listener");
      native.progress = listener;
      return {
        remove: async () => {
          native.removed.push("progress");
        },
      };
    },
    releaseNfcGateProgress: async (options: {
      attemptId: string;
      stage: string;
    }) => {
      native.calls.push(`release:${options.attemptId}:${options.stage}`);
    },
  }),
}));

afterEach(async () => {
  cleanup();
  await act(async () => {});
  native.reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const PM5_TYPE = Array.from(
  new TextEncoder().encode("concept2.com:bleconnectinfo"),
);

function nfcEvent(attemptId = "attempt-a") {
  return {
    attemptId,
    tag: {
      ndefMessage: [
        {
          tnf: 4,
          type: PM5_TYPE,
          id: [],
          payload: [1, 2, 3, 4, 5, 6, 0, 80, 77, 53, 32, 65, 0],
        },
      ],
    },
  };
}

async function renderReadyProbe() {
  vi.stubGlobal("crypto", {
    getRandomValues: crypto.getRandomValues.bind(crypto),
    randomUUID: () => `attempt-${String.fromCharCode(97 + native.nextId++)}`,
  });
  const { default: GateMinusOneProbe } = await import("./GateMinusOneProbe");
  const user = userEvent.setup();
  render(<GateMinusOneProbe />);
  await user.type(screen.getByLabelText("iPhone model"), "iPhone test");
  await user.type(screen.getByLabelText("iOS version"), "26.5");
  await user.type(screen.getByLabelText("PM5 model"), "PM5");
  await user.type(screen.getByLabelText("PM5 firmware"), "test");
  await user.type(screen.getByLabelText("PM5 advertised name"), "PM5 A");
  return user;
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function hold(name: string) {
  const pending = deferred();
  native.waits.set(name, pending.promise);
  return async () => {
    native.waits.delete(name);
    await act(async () => {
      pending.resolve();
    });
  };
}
const runButton = () =>
  screen.getByRole("button", { name: "Run normal sample" });
async function pause() {
  await act(async () => {
    native.appPause!({ isActive: false });
  });
}
async function matches() {
  await act(async () => {
    for (let i = 0; i < 2; i++)
      native.bleResult!({
        device: { deviceId: "device-a", name: "PM5 A" },
        localName: "PM5 A",
        rssi: -50,
        uuids: [],
      });
  });
}
async function exported(user: ReturnType<typeof userEvent.setup>) {
  const logger = vi.spyOn(console, "info").mockImplementation(() => {});
  await user.click(
    screen.getByRole("button", { name: "Copy redacted receipt" }),
  );
  const json = reassembleGateReceiptFrames(
    logger.mock.calls.map(([message]) => message as string),
  );
  logger.mockRestore();
  return JSON.parse(json) as NfcGateReceiptV1;
}

async function beginThroughBle(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Run normal sample" }));
  await waitFor(() => expect(native.nfcEvent).toBeTypeOf("function"));
  await act(async () => {
    native.nfcEvent!(nfcEvent());
  });
  await waitFor(() => expect(native.bleResult).toBeTypeOf("function"));
}

async function beginInactiveHandoff(user: ReturnType<typeof userEvent.setup>) {
  await user.click(runButton());
  native.foreground = false;
  await act(async () => native.nfcEvent!(nfcEvent()));
  await screen.findByText("NFC reader session ended.");
}

async function activate() {
  native.foreground = true;
  await act(async () => native.appActivity!({ isActive: true }));
}

describe("GateMinusOneProbe", () => {
  it("retains the radio lease until a cancelled activity query settles", async () => {
    const user = await renderReadyProbe();
    await user.click(runButton());
    native.foreground = false;
    const releaseQuery = hold("app-state");
    await act(async () => native.nfcEvent!(nfcEvent()));
    await waitFor(() =>
      expect(
        native.calls.filter((call) => call === "app-state:active-query"),
      ).toHaveLength(2),
    );
    await user.click(screen.getByRole("button", { name: "Cancel sample" }));
    expect(runButton()).toBeDisabled();
    await activate();
    expect(native.calls).not.toContain("ble-initialize");
    await releaseQuery();
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(native.removed).toContain("appStateChange");
    expect(native.calls).not.toContain("ble-initialize");
    expect((await exported(user)).attempts[0]!.connected).toBe(false);
  });
  it("reobserves activity lost during listener removal before starting BLE", async () => {
    const user = await renderReadyProbe();
    await beginInactiveHandoff(user);
    const retiredActivity = native.appActivity!;
    const releaseRemoval = hold("remove:appStateChange");
    await activate();
    await waitFor(() => expect(native.removed).toContain("appStateChange"));
    native.foreground = false;
    await act(async () => retiredActivity({ isActive: false }));
    await releaseRemoval();
    expect(native.calls).not.toContain("ble-initialize");
    await waitFor(() =>
      expect(
        native.calls.filter((call) => call === "app-activity-listener"),
      ).toHaveLength(2),
    );
    await act(async () => retiredActivity({ isActive: true }));
    expect(native.calls).not.toContain("ble-initialize");
    await activate();
    await waitFor(() => expect(native.bleResult).toBeTypeOf("function"));
    await matches();
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect((await exported(user)).attempts[0]).toMatchObject({
      connected: true,
      disconnected: true,
    });
    expect(
      native.removed.filter((name) => name === "appStateChange"),
    ).toHaveLength(2);
  });
  it("does not lose activation delivered before a stale inactive snapshot resolves", async () => {
    const user = await renderReadyProbe();
    await user.click(runButton());
    native.foreground = false;
    const releaseQuery = hold("app-state");
    await act(async () => native.nfcEvent!(nfcEvent()));
    await waitFor(() =>
      expect(
        native.calls.filter((call) => call === "app-state:active-query"),
      ).toHaveLength(2),
    );
    await activate();
    expect(native.calls).not.toContain("ble-initialize");
    await releaseQuery();
    await waitFor(() => expect(native.bleResult).toBeTypeOf("function"));
    await matches();
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect((await exported(user)).attempts[0]!.connected).toBe(true);
  });

  it("does not accept a stale active snapshot over a newer inactive event", async () => {
    const user = await renderReadyProbe();
    await user.click(runButton());
    const releaseQuery = hold("app-state");
    await act(async () => native.nfcEvent!(nfcEvent()));
    await waitFor(() =>
      expect(
        native.calls.filter((call) => call === "app-state:active-query"),
      ).toHaveLength(2),
    );
    native.foreground = false;
    await act(async () => native.appActivity!({ isActive: false }));
    await releaseQuery();
    await screen.findByText("NFC reader session ended.");
    expect(native.calls).not.toContain("ble-initialize");
    await activate();
    await waitFor(() => expect(native.bleResult).toBeTypeOf("function"));
    await matches();
    expect((await exported(user)).attempts[0]!.connected).toBe(true);
  });

  it.each(["Cancel", "background", "unmount"] as const)(
    "%s cancels an inactive handoff and stale activation cannot authorize B",
    async (ending) => {
      const user = await renderReadyProbe();
      await beginInactiveHandoff(user);
      const staleActivity = native.appActivity!;
      if (ending === "Cancel")
        await user.click(screen.getByRole("button", { name: "Cancel sample" }));
      else if (ending === "background") await pause();
      else cleanup();
      await waitFor(() => expect(native.removed).toContain("appStateChange"));
      expect(native.calls).not.toContain("ble-initialize");
      native.foreground = true;
      await act(async () => staleActivity({ isActive: true }));
      if (ending === "unmount") await renderReadyProbe();
      await waitFor(() => expect(runButton()).toBeEnabled());
      await user.click(runButton());
      native.foreground = false;
      await act(async () => native.nfcEvent!(nfcEvent("attempt-b")));
      await screen.findByText("NFC reader session ended.");
      await act(async () => staleActivity({ isActive: true }));
      expect(native.calls).not.toContain("ble-initialize");
      await activate();
      await waitFor(() => expect(native.bleResult).toBeTypeOf("function"));
      await matches();
      await waitFor(() => expect(runButton()).toBeEnabled());
      expect(
        native.calls.filter((call) => call === "ble-initialize"),
      ).toHaveLength(1);
      expect((await exported(user)).attempts.at(-1)).toMatchObject({
        connected: true,
        disconnected: true,
      });
    },
  );

  it("self-removes a late activity registration after cancellation without querying or arming BLE", async () => {
    const user = await renderReadyProbe();
    await user.click(runButton());
    const releaseListener = hold("appStateChange");
    await act(async () => native.nfcEvent!(nfcEvent()));
    await waitFor(() =>
      expect(native.calls).toContain("app-activity-listener"),
    );
    await user.click(screen.getByRole("button", { name: "Cancel sample" }));
    expect(runButton()).toBeDisabled();
    await releaseListener();
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(
      native.removed.filter((name) => name === "appStateChange"),
    ).toHaveLength(1);
    expect(
      native.calls.filter((call) => call === "app-state:active-query"),
    ).toHaveLength(1);
    expect(native.calls).not.toContain("ble-initialize");
  });

  it.each(["activation", "cancel"] as const)(
    "latches restart when activity listener removal rejects during %s",
    async (ending) => {
      const user = await renderReadyProbe();
      await beginInactiveHandoff(user);
      const failure = deferred();
      native.waits.set("remove:appStateChange", failure.promise);
      if (ending === "activation") await activate();
      else
        await user.click(screen.getByRole("button", { name: "Cancel sample" }));
      await waitFor(() => expect(native.removed).toContain("appStateChange"));
      expect(runButton()).toBeDisabled();
      await act(async () =>
        failure.reject(new Error("private activity handle")),
      );
      await screen.findByText(/Cleanup failed; restart/);
      expect(runButton()).toBeDisabled();
      expect(native.calls).not.toContain("ble-initialize");
      expect(native.removed).toStrictEqual(
        expect.arrayContaining(["pause", "resume"]),
      );
      expect(JSON.stringify(await exported(user))).not.toContain(
        "private activity handle",
      );
    },
  );

  it("waits after NFC stop for actual activation, never resume alone, then connects once", async () => {
    const user = await renderReadyProbe();
    await user.click(runButton());
    const releaseStop = hold("nfc-stop");
    native.foreground = false;
    await act(async () => native.nfcEvent!(nfcEvent()));
    expect(native.calls).not.toContain("app-activity-listener");
    expect(native.calls).not.toContain("ble-initialize");
    await releaseStop();
    await waitFor(() =>
      expect(
        native.calls.filter((call) => call === "app-state:active-query"),
      ).toHaveLength(2),
    );
    expect(runButton()).toBeDisabled();
    await act(async () => native.appResume!({ isActive: true }));
    expect(native.calls).not.toContain("ble-initialize");
    await act(async () => native.appActivity!({ isActive: false }));
    expect(native.calls).not.toContain("ble-initialize");
    native.foreground = true;
    await act(async () => {
      native.appActivity!({ isActive: true });
      native.appActivity!({ isActive: true });
    });
    await waitFor(() => expect(native.bleResult).toBeTypeOf("function"));
    await matches();
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(
      native.calls.filter((call) => call === "ble-initialize"),
    ).toHaveLength(1);
    expect(
      native.calls.filter((call) => call === "ble-connect:device-a"),
    ).toHaveLength(1);
    expect(
      native.calls.filter((call) => call === "ble-disconnect:device-a"),
    ).toHaveLength(1);
    expect(
      native.removed.filter((name) => name === "appStateChange"),
    ).toHaveLength(1);
    const receipt = await exported(user);
    expect(receipt.attempts[0]).toMatchObject({
      connected: true,
      disconnected: true,
      matchingDeviceCount: 1,
    });
    expect(receipt.attempts[0]!.records[0]!.payload).toStrictEqual([
      0, 0, 0, 0, 0, 0, 0, 80, 77, 53, 32, 65, 0,
    ]);
  });
  it("requires restart after an arranged native stop rejection during cancellation", async () => {
    const user = await renderReadyProbe();
    await user.click(runButton());
    const failure = deferred();
    native.waits.set("nfc-stop", failure.promise);
    await user.click(screen.getByRole("button", { name: "Cancel sample" }));
    expect(runButton()).toBeDisabled();
    await act(async () => failure.reject(new Error("private native release")));
    expect(
      await screen.findByText(/Cleanup failed; restart/),
    ).toBeInTheDocument();
    expect(runButton()).toBeDisabled();
    expect(native.removed).toStrictEqual(
      expect.arrayContaining(["nfcEvent", "nfcSessionEnd", "pause", "resume"]),
    );
    expect(native.calls).not.toContain("nfc-start:attempt-b");
    expect(JSON.stringify(await exported(user))).not.toContain(
      "private native release",
    );
  });
  it.each(["ble-enabled", "ble-disconnect"] as const)(
    "does not publish success after foreground loss during %s",
    async (stage) => {
      const release = hold(stage);
      const user = await renderReadyProbe();
      if (stage === "ble-enabled") {
        await user.click(runButton());
        await act(async () => native.nfcEvent!(nfcEvent()));
      } else {
        await beginThroughBle(user);
        await matches();
      }
      await pause();
      await release();
      await waitFor(() => expect(runButton()).toBeEnabled());
      const receipt = await exported(user);
      expect(receipt.criteria.pickerFreeBleConnect).toBe(false);
      expect(
        native.calls.includes("ble-requestLEScan:unfiltered:duplicates"),
      ).toBe(stage === "ble-disconnect");
      expect(receipt.attempts[0]!.disconnected).toBe(
        stage === "ble-disconnect",
      );
    },
  );

  it("requires restart if a late registration's self-removal rejects", async () => {
    const release = hold("nfcEvent");
    const user = await renderReadyProbe();
    await user.click(runButton());
    await pause();
    const failure = deferred();
    native.waits.set("remove:nfcEvent", failure.promise);
    await release();
    await act(async () => failure.reject(new Error("private handle")));
    await screen.findByText(/Cleanup failed; restart/);
    expect(runButton()).toBeDisabled();
    expect(native.calls).not.toContain("nfc-start:attempt-a");
    expect(native.removed).toStrictEqual(
      expect.arrayContaining(["nfcEvent", "pause", "resume"]),
    );
  });
  it.each([
    "not-json",
    "null",
    JSON.stringify({ scenario: "normal", reloadPending: true }),
    JSON.stringify({
      scenario: "webview-reload",
      reloadPending: true,
      iphone: {},
      pm5: {},
      priorAttemptId: "a",
      priorStage: "unknown",
    }),
  ])(
    "discards corrupt reload metadata %s without starting a successor",
    async (value) => {
      sessionStorage.setItem("ergomatic:nfc-gate-minus-one", value);
      await renderReadyProbe();
      expect(
        screen.queryByRole("button", { name: "Start B" }),
      ).not.toBeInTheDocument();
      expect(native.calls).toStrictEqual([]);
      expect(sessionStorage.getItem("ergomatic:nfc-gate-minus-one")).toBeNull();
    },
  );

  it("refuses initial NFC without positive activity", async () => {
    const user = await renderReadyProbe();
    native.foreground = false;
    await user.click(runButton());
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(native.calls).not.toContain("nfc-start:attempt-a");
    expect((await exported(user)).attempts[0]!.connected).toBe(false);
  });

  it("operator cancellation stops a scan with no second match and retains failed evidence", async () => {
    const user = await renderReadyProbe();
    await beginThroughBle(user);
    await user.click(screen.getByRole("button", { name: "Cancel sample" }));
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(native.calls).toContain("ble-stopLEScan");
    expect(native.calls).not.toContain("ble-connect:device-a");
    expect((await exported(user)).attempts[0]!.connected).toBe(false);
  });

  it.each(["malformed", "missing", "short"] as const)(
    "retains %s NFC evidence but does not initialize BLE",
    async (kind) => {
      const user = await renderReadyProbe();
      await user.click(runButton());
      const value = nfcEvent();
      if (kind === "malformed")
        Object.assign(value.tag, { ndefMessage: "private" });
      if (kind === "missing") value.tag.ndefMessage = [];
      if (kind === "short") value.tag.ndefMessage[0]!.payload = [1, 2];
      await act(async () => native.nfcEvent!(value));
      await waitFor(() => expect(runButton()).toBeEnabled());
      expect(native.calls).not.toContain("ble-initialize");
      const logger = vi.spyOn(console, "info").mockImplementation(() => {});
      await user.click(
        screen.getByRole("button", { name: "Copy redacted receipt" }),
      );
      expect(logger.mock.calls.length > 0).toBe(kind !== "short");
      expect(Boolean(screen.queryByText(/Receipt validation failed/))).toBe(
        kind === "short",
      );
    },
  );

  it.each(["webview-reload", "stop-during-connect"] as const)(
    "drains or stays drained if %s cannot save its reload metadata",
    async (scenario) => {
      const user = await renderReadyProbe();
      const reload = vi.fn();
      vi.stubGlobal("location", { reload });
      await user.click(
        screen.getByRole("button", { name: `Run ${scenario} sample` }),
      );
      await act(async () =>
        native.progress!({ attemptId: "attempt-a", stage: "connect" }),
      );
      vi.spyOn(console, "info").mockImplementation(() => {});
      await user.click(
        screen.getByRole("button", { name: "Export partial receipt" }),
      );
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("storage quota");
      });
      await user.click(screen.getByRole("button", { name: "Reload WebView" }));
      await screen.findByText(
        scenario === "webview-reload"
          ? "Reload failed; A was stopped and drained."
          : "Reload metadata could not be saved; do not reload.",
      );
      expect(native.calls).toContain("nfc-stop:attempt-a");
      expect(reload).not.toHaveBeenCalled();
      expect(sessionStorage.getItem("ergomatic:nfc-gate-minus-one")).toBeNull();
    },
  );
  it("does not arm BLE from a record until its pending NFC start settles", async () => {
    const release = hold("nfc-start");
    const user = await renderReadyProbe();
    await user.click(runButton());
    await act(async () => {
      native.nfcEvent!(nfcEvent());
    });
    expect(native.calls).not.toContain("ble-initialize");
    await release();
    await waitFor(() =>
      expect(native.calls).toContain("ble-requestLEScan:unfiltered:duplicates"),
    );
  });

  it("continues the BLE handoff when native stop emits an ending before its drain acknowledgment", async () => {
    const user = await renderReadyProbe();
    vi.spyOn(
      (await import("@capgo/capacitor-nfc")).CapacitorNfc,
      "stopScanning",
    ).mockImplementationOnce(async (options) => {
      native.calls.push(`nfc-stop:${options!.attemptId}`);
      native.nfcSessionEnd!({
        attemptId: options!.attemptId,
        reason: "invalidated",
      });
    });
    await beginThroughBle(user);
    await matches();
    const receipt = await exported(user);
    expect(receipt.readerEndings).toStrictEqual([]);
    expect(receipt.attempts[0]).toMatchObject({
      connected: true,
      disconnected: true,
    });
  });
  it("frames fresh strict receipts before and after a pending disconnect drain", async () => {
    const user = await renderReadyProbe();
    const logger = vi.spyOn(console, "info").mockImplementation(() => {});
    const releaseDisconnect = hold("ble-disconnect");
    await beginThroughBle(user);
    await matches();
    await waitFor(() => expect(native.calls).toContain("ble-connect:device-a"));
    await user.click(screen.getByRole("button", { name: "Cancel sample" }));
    const entryFrames = logger.mock.calls.map(([message]) => message as string);
    const entryReceipt = JSON.parse(
      reassembleGateReceiptFrames(entryFrames),
    ) as NfcGateReceiptV1;
    expect(entryReceipt).toMatchObject({
      schema: "ergomatic/nfc-gate-minus-one/v1",
      attempts: [{ connected: true, disconnected: false }],
    });
    await releaseDisconnect();
    await waitFor(() => expect(runButton()).toBeEnabled());
    const finalFrames = logger.mock.calls
      .slice(entryFrames.length)
      .map(([message]) => message as string);
    const finalReceipt = JSON.parse(
      reassembleGateReceiptFrames(finalFrames),
    ) as NfcGateReceiptV1;
    expect(finalReceipt).toMatchObject({
      attempts: [{ connected: true, disconnected: true }],
    });
    expect(
      JSON.parse(reassembleGateReceiptFrames(entryFrames)) as NfcGateReceiptV1,
    ).not.toStrictEqual(finalReceipt);
    logger.mockRestore();
  });
  it("retains a failed sample without arming when secure UUID generation is unavailable", async () => {
    const user = await renderReadyProbe();
    vi.stubGlobal("crypto", {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    await user.click(runButton());
    await waitFor(() =>
      expect(
        screen.getByText(/Secure attempt IDs are unavailable/),
      ).toBeInTheDocument(),
    );
    expect(native.calls).toStrictEqual([]);
    expect((await exported(user)).attempts[0]!.capabilityLatencyMs).toBeNull();
  });
  it("waits for the scan-start acknowledgment before consuming early advertisements", async () => {
    const release = hold("ble-start");
    const user = await renderReadyProbe();
    await beginThroughBle(user);
    await matches();
    expect(native.calls).not.toContain("ble-stopLEScan");
    expect(native.calls).not.toContain("ble-connect:device-a");
    await release();
    await waitFor(() =>
      expect(native.calls).toContain("ble-disconnect:device-a"),
    );
  });

  it("removes a late registration after true unmount without starting NFC", async () => {
    const release = hold("nfcEvent");
    const user = await renderReadyProbe();
    await user.click(runButton());
    cleanup();
    await release();
    expect(native.removed).toStrictEqual(
      expect.arrayContaining(["nfcEvent", "pause", "resume"]),
    );
    expect(native.calls).not.toContain("nfc-start:attempt-a");
  });

  it("cleans earlier handles after listener registration rejects and preserves the failed attempt", async () => {
    const failure = deferred();
    native.waits.set("nfcSessionEnd", failure.promise);
    const user = await renderReadyProbe();
    await user.click(runButton());
    await act(async () => {
      failure.reject(new Error("private-bridge-id"));
    });
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(native.removed).toStrictEqual(
      expect.arrayContaining(["nfcEvent", "pause", "resume"]),
    );
    expect(native.calls).not.toContain("nfc-start:attempt-a");
    const receipt = await exported(user);
    expect(receipt.attempts).toHaveLength(1);
    expect(receipt.attempts[0]!.records).toStrictEqual([]);
    expect(JSON.stringify(receipt)).not.toContain("private-bridge-id");
  });

  it.each(["app-state", "ble-initialize", "ble-stop"])(
    "checks cancellation after pending %s resolves",
    async (stage) => {
      const release = hold(stage);
      const user = await renderReadyProbe();
      if (stage === "app-state") await user.click(runButton());
      else {
        await user.click(runButton());
        await act(async () => {
          native.nfcEvent!(nfcEvent());
        });
        if (stage === "ble-stop") await matches();
      }
      await pause();
      expect(runButton()).toBeDisabled();
      await release();
      await waitFor(() => expect(runButton()).toBeEnabled());
      expect(native.calls).not.toContain("ble-connect:device-a");
      const forbidden =
        stage === "app-state"
          ? "nfc-start:attempt-a"
          : stage === "ble-initialize"
            ? "ble-enabled"
            : "ble-connect:device-a";
      expect(native.calls).not.toContain(forbidden);
    },
  );

  it("retains a Bluetooth-off sample and allows another attempt without DEBUG calls", async () => {
    native.enabled = false;
    const user = await renderReadyProbe();
    await user.click(runButton());
    await act(async () => {
      native.nfcEvent!(nfcEvent());
    });
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(native.calls).not.toContain(
      "ble-requestLEScan:unfiltered:duplicates",
    );
    native.enabled = true;
    await user.click(runButton());
    await act(async () => {
      native.nfcEvent!(nfcEvent("attempt-b"));
    });
    await matches();
    const result = await exported(user);
    expect(result.attempts.map((entry) => entry.connected)).toStrictEqual([
      false,
      true,
    ]);
    expect(native.calls).not.toContain("progress-listener");
    expect(result.criteria.exactLocalNameBridge).toBe(true);
    expect(result.criteria.paddingRuleObserved).toBe(false);
  });
  it("cannot register or start when capability resolves after true unmount", async () => {
    const release = hold("capability");
    const user = await renderReadyProbe();
    await user.click(runButton());
    cleanup();
    await release();
    expect(native.calls).toStrictEqual(["nfc-capability"]);
  });

  it("keeps re-arm locked until a late listener handle self-removes", async () => {
    const release = hold("nfcEvent");
    const user = await renderReadyProbe();
    await user.click(runButton());
    await pause();
    expect(runButton()).toBeDisabled();
    await release();
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(native.removed).toContain("nfcEvent");
    expect(native.calls).not.toContain("nfc-start:attempt-a");
  });

  it.each(["nfc-start", "ble-start", "ble-connect"])(
    "drains a pending %s before another attempt can own the radio",
    async (stage) => {
      const release = hold(stage);
      const user = await renderReadyProbe();
      if (stage === "nfc-start") await user.click(runButton());
      else {
        await beginThroughBle(user);
        if (stage === "ble-connect") await matches();
      }
      await pause();
      expect(runButton()).toBeDisabled();
      await release();
      await waitFor(() => expect(runButton()).toBeEnabled());
      const expected =
        stage === "nfc-start"
          ? "nfc-stop:attempt-a"
          : stage === "ble-start"
            ? "ble-stopLEScan"
            : "ble-disconnect:device-a";
      expect(native.calls.filter((call) => call === expected)).toHaveLength(
        stage === "ble-connect" ? 1 : 2,
      );
      await user.click(runButton());
      expect(native.calls.indexOf("nfc-start:attempt-b")).toBeGreaterThan(
        native.calls.lastIndexOf(expected),
      );
    },
  );

  it("removes remaining listeners after rejection and requires restart without exporting bridge errors", async () => {
    const user = await renderReadyProbe();
    await user.click(runButton());
    const failure = deferred();
    native.waits.set("remove:nfcEvent", failure.promise);
    await act(async () => {
      native.nfcEvent!(nfcEvent());
      failure.reject(new Error("secret-device-id"));
    });
    await waitFor(() =>
      expect(screen.getByText(/Cleanup failed; restart/)).toBeInTheDocument(),
    );
    expect(native.removed).toStrictEqual(
      expect.arrayContaining(["nfcEvent", "nfcSessionEnd", "pause", "resume"]),
    );
    expect(runButton()).toBeDisabled();
    expect(native.calls).not.toContain("ble-initialize");
    expect(JSON.stringify(await exported(user))).not.toContain(
      "secret-device-id",
    );
  });

  it.each([
    { scenario: "stop-during-connect", stage: "connect" },
    { scenario: "stop-during-query", stage: "query" },
    { scenario: "stop-during-read", stage: "read" },
    { scenario: "webview-reload", stage: "connect" },
  ] as const)(
    "exports %s A with the prescribed native lifetime, starts B before releasing A, and rejects stale callbacks",
    async ({ scenario, stage }) => {
      const user = await renderReadyProbe();
      const reload = vi.fn();
      vi.stubGlobal("location", { reload });
      await user.click(
        screen.getByRole("button", { name: `Run ${scenario} sample` }),
      );
      await act(async () => {
        native.progress!({ attemptId: {}, stage });
        native.progress!({ attemptId: "attempt-a", stage: "unknown" });
      });
      expect(
        screen.queryByRole("button", { name: "Export partial receipt" }),
      ).not.toBeInTheDocument();
      await act(async () => {
        native.progress!({ attemptId: "attempt-a", stage });
      });
      await screen.findByRole("button", { name: "Export partial receipt" });
      expect(native.calls.includes("nfc-stop:attempt-a")).toBe(
        scenario !== "webview-reload",
      );
      const logger = vi.spyOn(console, "info").mockImplementation(() => {});
      const clipboard = vi
        .spyOn(navigator.clipboard, "writeText")
        .mockRejectedValue(new Error("No user activation"));
      await act(async () =>
        document.getElementById("nfc-gate-export")!.click(),
      );
      expect(clipboard).not.toHaveBeenCalled();
      const partial = JSON.parse(
        reassembleGateReceiptFrames(
          logger.mock.calls.map(([message]) => message as string),
        ),
      ) as NfcGateReceiptV1;
      expect(partial.attempts).toHaveLength(1);
      expect(partial.attempts[0]!.scenario).toBe(scenario);
      expect(partial.verdict).toBe("NO-GO");
      logger.mockRestore();
      expect(reload).not.toHaveBeenCalled();
      await act(async () =>
        document.getElementById("nfc-gate-reload")!.click(),
      );
      await waitFor(() => expect(reload).toHaveBeenCalledOnce());
      expect(native.removed).toStrictEqual(
        expect.arrayContaining([
          "nfcEvent",
          "nfcSessionEnd",
          "progress",
          "pause",
          "resume",
        ]),
      );
      const stored = sessionStorage.getItem("ergomatic:nfc-gate-minus-one")!;
      expect(stored).not.toMatch(/records|deviceId|receipt/);
      cleanup();
      expect(native.calls.includes("nfc-stop:attempt-a")).toBe(
        scenario !== "webview-reload",
      );
      const { default: Probe } = await import("./GateMinusOneProbe");
      render(<Probe />);
      expect(sessionStorage.getItem("ergomatic:nfc-gate-minus-one")).toBeNull();
      expect(native.calls).not.toContain(`release:attempt-a:${stage}`);
      const acknowledgeB = hold("nfc-start");
      await act(async () =>
        document.getElementById("nfc-gate-start-b")!.click(),
      );
      expect(native.calls).toContain("nfc-start:attempt-b");
      expect(native.calls).not.toContain(`release:attempt-a:${stage}`);
      await acknowledgeB();
      await waitFor(() =>
        expect(native.calls).toContain(`release:attempt-a:${stage}`),
      );
      expect(native.calls.indexOf("nfc-start:attempt-b")).toBeLessThan(
        native.calls.indexOf(`release:attempt-a:${stage}`),
      );
      expect(native.starts).toStrictEqual([
        {
          attemptId: "attempt-a",
          alertMessage: "Hold your iPhone near the PM5.",
          iosSessionType: "ndef",
          invalidateAfterFirstRead: false,
          gateMinusOneHoldStage: stage,
        },
        {
          attemptId: "attempt-b",
          alertMessage: "Hold your iPhone near the PM5.",
          iosSessionType: "ndef",
          invalidateAfterFirstRead: false,
        },
      ]);
      await act(async () => {
        native.nfcEvent!(nfcEvent("attempt-a"));
        native.nfcSessionEnd!({
          attemptId: "attempt-a",
          reason: "userCancelled",
        });
        native.progress!({ attemptId: "attempt-a", stage });
      });
      const pending = await exported(user);
      expect(pending.attempts[0]!.staleIdDroppedCount).toBe(3);
      expect(pending.attempts[0]!.records).toStrictEqual([]);
      expect(pending.readerEndings).toStrictEqual([]);
      expect(pending.criteria.staleACannotAffectB).toBe(false);
      await act(async () => {
        native.nfcEvent!(nfcEvent("attempt-b"));
      });
      await matches();
      const complete = await exported(user);
      expect(complete.attempts[0]).toMatchObject({
        connected: true,
        disconnected: true,
        staleAttemptSettlementCount: null,
        staleIdDroppedCount: 3,
      });
      expect(complete.criteria.staleACannotAffectB).toBe(true);
      expect(native.calls.includes("nfc-stop:attempt-a")).toBe(
        scenario !== "webview-reload",
      );
    },
  );

  it("waits for live-reload listener removal and cancels transfer on an uncertain release", async () => {
    const user = await renderReadyProbe();
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    await user.click(
      screen.getByRole("button", { name: "Run webview-reload sample" }),
    );
    await act(async () =>
      native.progress!({ attemptId: "attempt-a", stage: "connect" }),
    );
    const release = deferred();
    native.waits.set("remove:nfcEvent", release.promise);
    vi.spyOn(console, "info").mockImplementation(() => {});
    await user.click(
      screen.getByRole("button", { name: "Export partial receipt" }),
    );
    await user.click(screen.getByRole("button", { name: "Reload WebView" }));
    expect(reload).not.toHaveBeenCalled();
    expect(runButton()).toBeDisabled();
    expect(native.calls).not.toContain("nfc-stop:attempt-a");
    await act(async () => release.reject(new Error("private-listener")));
    await screen.findByText(/Cleanup failed; restart/);
    expect(native.calls).toContain("nfc-stop:attempt-a");
    expect(native.removed).toStrictEqual(
      expect.arrayContaining(["nfcSessionEnd", "progress", "pause", "resume"]),
    );
    expect(reload).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("ergomatic:nfc-gate-minus-one")).toBeNull();
  });

  it("frames both live-reload snapshots while listener removal is pending", async () => {
    const user = await renderReadyProbe();
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    await user.click(
      screen.getByRole("button", { name: "Run webview-reload sample" }),
    );
    await act(async () =>
      native.progress!({ attemptId: "attempt-a", stage: "connect" }),
    );
    const logger = vi.spyOn(console, "info").mockImplementation(() => {});
    await user.click(
      screen.getByRole("button", { name: "Export partial receipt" }),
    );
    const manualFrameCount = logger.mock.calls.length;
    const release = hold("remove:nfcEvent");
    await user.click(screen.getByRole("button", { name: "Reload WebView" }));
    const entryFrames = logger.mock.calls
      .slice(manualFrameCount)
      .map(([message]) => message as string);
    expect(
      JSON.parse(reassembleGateReceiptFrames(entryFrames)) as NfcGateReceiptV1,
    ).toMatchObject({ attempts: [{ scenario: "webview-reload" }] });
    await release();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    const finalFrames = logger.mock.calls
      .slice(manualFrameCount + entryFrames.length)
      .map(([message]) => message as string);
    expect(
      JSON.parse(reassembleGateReceiptFrames(finalFrames)) as NfcGateReceiptV1,
    ).toMatchObject({ attempts: [{ scenario: "webview-reload" }] });
    logger.mockRestore();
  });

  it("keeps a live-A entry capture failure visible through stalled cleanup and retires it for the next sample", async () => {
    const user = await renderReadyProbe();
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    await user.click(
      screen.getByRole("button", { name: "Run webview-reload sample" }),
    );
    await act(async () =>
      native.progress!({ attemptId: "attempt-a", stage: "connect" }),
    );
    const logger = vi.spyOn(console, "info").mockImplementation(() => {});
    await user.click(
      screen.getByRole("button", { name: "Export partial receipt" }),
    );
    const manualFrameCount = logger.mock.calls.length;
    const release = hold("remove:nfcEvent");
    let failFirstAutomaticCapture = true;
    logger.mockImplementation(() => {
      if (failFirstAutomaticCapture) {
        failFirstAutomaticCapture = false;
        throw new Error("console unavailable");
      }
    });
    await user.click(screen.getByRole("button", { name: "Reload WebView" }));
    expect(reload).not.toHaveBeenCalled();
    expect(runButton()).toBeDisabled();
    await release();
    await screen.findByText(
      "Receipt validation failed; raw or malformed evidence was not exported.",
    );
    const finalFrames = logger.mock.calls
      // The failed reload-entry fragment is one call; drain then emits its
      // entry receipt before this post-cleanup final receipt.
      .slice(manualFrameCount + 3)
      .map(([message]) => message as string);
    expect(finalFrames).toHaveLength(2);
    expect(
      JSON.parse(reassembleGateReceiptFrames(finalFrames)) as NfcGateReceiptV1,
    ).toMatchObject({ attempts: [{ scenario: "webview-reload" }] });
    expect(native.calls).toContain("nfc-stop:attempt-a");
    expect(reload).not.toHaveBeenCalled();
    logger.mockRestore();

    await user.click(runButton());
    await user.click(screen.getByRole("button", { name: "Cancel sample" }));
    await screen.findByText("Sample cancelled and drained.");
  });

  it("keeps RESTART above an automatic capture failure when cleanup fails", async () => {
    const user = await renderReadyProbe();
    await user.click(runButton());
    const logger = vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("console unavailable");
    });
    const rejectedStop = deferred();
    native.waits.set("nfc-stop", rejectedStop.promise);
    await user.click(screen.getByRole("button", { name: "Cancel sample" }));
    await act(async () => rejectedStop.reject(new Error("native stop failed")));
    expect(
      await screen.findByText(/Cleanup failed; restart/),
    ).toBeInTheDocument();
    logger.mockRestore();
  });

  it("blocks a live reload when its final automatic receipt capture fails and still drains A", async () => {
    const user = await renderReadyProbe();
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    await user.click(
      screen.getByRole("button", { name: "Run webview-reload sample" }),
    );
    await act(async () =>
      native.progress!({ attemptId: "attempt-a", stage: "connect" }),
    );
    const logger = vi.spyOn(console, "info").mockImplementation(() => {});
    await user.click(
      screen.getByRole("button", { name: "Export partial receipt" }),
    );
    const firstSnapshotFrames = logger.mock.calls.length;
    let automaticFrames = 0;
    logger.mockImplementation(() => {
      automaticFrames += 1;
      if (automaticFrames > firstSnapshotFrames)
        throw new Error("console unavailable");
    });
    await user.click(screen.getByRole("button", { name: "Reload WebView" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "Receipt validation failed; raw or malformed evidence was not exported.",
        ),
      ).toBeInTheDocument(),
    );
    expect(reload).not.toHaveBeenCalled();
    expect(native.calls).toContain("nfc-stop:attempt-a");
    logger.mockRestore();
  });

  it("blocks a stopped-A reload when its entry snapshot cannot be framed", async () => {
    const user = await renderReadyProbe();
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    await user.click(
      screen.getByRole("button", { name: "Run stop-during-connect sample" }),
    );
    await act(async () =>
      native.progress!({ attemptId: "attempt-a", stage: "connect" }),
    );
    await screen.findByRole("button", { name: "Export partial receipt" });
    const logger = vi.spyOn(console, "info").mockImplementation(() => {});
    await user.click(
      screen.getByRole("button", { name: "Export partial receipt" }),
    );
    logger.mockImplementation(() => {
      throw new Error("console unavailable");
    });
    await user.click(screen.getByRole("button", { name: "Reload WebView" }));
    await screen.findByText(
      "Receipt validation failed; raw or malformed evidence was not exported.",
    );
    expect(reload).not.toHaveBeenCalled();
    logger.mockRestore();
  });

  it.each(["background", "unmount"] as const)(
    "cancels live transfer on %s while listener removal is pending",
    async (ending) => {
      const user = await renderReadyProbe();
      const reload = vi.fn();
      vi.stubGlobal("location", { reload });
      await user.click(
        screen.getByRole("button", { name: "Run webview-reload sample" }),
      );
      await act(async () =>
        native.progress!({ attemptId: "attempt-a", stage: "connect" }),
      );
      const release = hold("remove:nfcEvent");
      vi.spyOn(console, "info").mockImplementation(() => {});
      await user.click(
        screen.getByRole("button", { name: "Export partial receipt" }),
      );
      await user.click(screen.getByRole("button", { name: "Reload WebView" }));
      if (ending === "background") await pause();
      else cleanup();
      await release();
      expect(native.calls).toContain("nfc-stop:attempt-a");
      expect(reload).not.toHaveBeenCalled();
      expect(sessionStorage.getItem("ergomatic:nfc-gate-minus-one")).toBeNull();
    },
  );

  it("withdraws live-reload readiness when A ends before transfer", async () => {
    const user = await renderReadyProbe();
    await user.click(
      screen.getByRole("button", { name: "Run webview-reload sample" }),
    );
    await act(async () =>
      native.progress!({ attemptId: "attempt-a", stage: "connect" }),
    );
    await screen.findByRole("button", { name: "Export partial receipt" });
    await pause();
    await waitFor(() => expect(runButton()).toBeEnabled());
    expect(
      screen.queryByRole("button", { name: "Reload WebView" }),
    ).not.toBeInTheDocument();
  });

  it.each(["userCancelled", "invalidated"] as const)(
    "retains all selected ending observations including forced %s without certifying its native producer",
    async (forcedReason) => {
      const user = await renderReadyProbe();
      native.supported = false;
      await user.click(runButton());
      native.supported = true;
      await user.click(screen.getByRole("button", { name: "Sheet cancel" }));
      expect(native.calls).toContain("nfc-start:attempt-b");
      const staleEnd = native.nfcSessionEnd!;
      expect(native.calls).not.toContain("nfc-stop:attempt-b");
      await act(async () => {
        native.nfcSessionEnd!({
          attemptId: "attempt-b",
          reason: "userCancelled",
        });
      });
      await user.click(screen.getByRole("button", { name: "No-tag timeout" }));
      await act(async () => {
        staleEnd({ attemptId: "attempt-b", reason: "invalidated" });
        native.nfcSessionEnd!({
          attemptId: "attempt-c",
          reason: { deviceId: "private" },
        });
      });
      expect(runButton()).toBeDisabled();
      await act(async () => {
        native.nfcSessionEnd!({
          attemptId: "attempt-c",
          reason: "sessionTimeout",
        });
      });
      await user.click(
        screen.getByRole("button", { name: "Forced invalidation" }),
      );
      await act(async () => {
        native.nfcSessionEnd!({
          attemptId: "attempt-d",
          reason: forcedReason,
        });
      });
      const result = await exported(user);
      expect(result.attempts).toHaveLength(4);
      expect(result.attempts[0]!.records).toStrictEqual([]);
      expect(result.readerEndings).toStrictEqual([
        { action: "sheet-cancel", observedReason: "userCancelled" },
        { action: "no-tag-timeout", observedReason: "sessionTimeout" },
        { action: "forced-invalidation", observedReason: forcedReason },
      ]);
      expect(result.criteria.readerEndingSemanticsObserved).toBe(false);
      expect(result.criteria.paddingRuleObserved).toBe(false);
      expect(result.signedEntitlement).toStrictEqual([]);
    },
  );
  it("arms native NFC before BLE and connects only after two exact local-name advertisements", async () => {
    const user = await renderReadyProbe();
    await beginThroughBle(user);
    expect(native.starts).toStrictEqual([
      {
        attemptId: "attempt-a",
        alertMessage: "Hold your iPhone near the PM5.",
        iosSessionType: "ndef",
        invalidateAfterFirstRead: false,
      },
    ]);

    await act(async () => {
      native.bleResult!({
        device: { deviceId: "device-a" },
        localName: "PM5 A",
      });
      native.bleResult!({
        device: { deviceId: "device-a" },
        localName: "PM5 A",
      });
    });

    await waitFor(() =>
      expect(native.calls).toStrictEqual([
        "nfc-capability",
        "app-listener",
        "nfc-listener:nfcEvent",
        "nfc-listener:nfcSessionEnd",
        "app-state:active-query",
        "nfc-start:attempt-a",
        "nfc-stop:attempt-a",
        "nfc-listeners-removed",
        "app-activity-listener",
        "app-state:active-query",
        "ble-initialize",
        "ble-enabled",
        "ble-requestLEScan:unfiltered:duplicates",
        "ble-stopLEScan",
        "ble-connect:device-a",
        "ble-disconnect:device-a",
      ]),
    );
  });

  it("rejects name-only and non-operator advertisements, then blocks a collision", async () => {
    const user = await renderReadyProbe();
    await beginThroughBle(user);

    await act(async () => {
      native.bleResult!({ device: { deviceId: "device-name", name: "PM5 A" } });
      native.bleResult!({
        device: { deviceId: "device-prefix" },
        localName: "PM5",
      });
      native.bleResult!({ deviceId: "root-only", localName: "PM5 A" });
    });
    expect(screen.getByText("Matching device count: 0")).toBeInTheDocument();

    await act(async () => {
      native.bleResult!({
        device: { deviceId: "device-a" },
        localName: "PM5 A",
      });
      native.bleResult!({
        device: { deviceId: "device-b" },
        localName: "PM5 A",
      });
      native.bleResult!({
        device: { deviceId: "device-a" },
        localName: "PM5 A",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Matching device count: 2")).toBeInTheDocument();
      expect(native.calls).toContain("ble-stopLEScan");
      expect(native.calls).not.toContain("ble-connect:device-a");
      expect(native.calls).not.toContain("ble-connect:device-b");
    });
  });

  it("records a rejected scan stop and never connects", async () => {
    const user = await renderReadyProbe();
    await beginThroughBle(user);
    const stopBleScan = vi
      .spyOn(
        (await import("@capacitor-community/bluetooth-le")).BleClient,
        "stopLEScan",
      )
      .mockRejectedValueOnce(new Error("stop failed"));

    await act(async () => {
      native.bleResult!({
        device: { deviceId: "device-a" },
        localName: "PM5 A",
      });
      native.bleResult!({
        device: { deviceId: "device-a" },
        localName: "PM5 A",
      });
    });

    await waitFor(() => {
      expect(stopBleScan).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/Cleanup failed; restart/)).toBeInTheDocument();
      expect(runButton()).toBeDisabled();
      expect(native.calls).not.toContain("ble-connect:device-a");
    });
  });

  it("drains on foreground loss and ignores BLE callbacks that arrive after stop", async () => {
    const user = await renderReadyProbe();
    await beginThroughBle(user);
    await act(async () => {
      native.appPause!({ isActive: false });
    });
    await act(async () => {
      native.bleResult!({
        device: { deviceId: "device-a" },
        localName: "PM5 A",
      });
      native.bleResult!({
        device: { deviceId: "device-a" },
        localName: "PM5 A",
      });
    });
    await waitFor(() => {
      expect(native.calls).toContain("ble-stopLEScan");
      expect(native.calls).not.toContain("ble-connect:device-a");
      expect(
        screen.getByText(/App backgrounded; radio operations drained/),
      ).toBeInTheDocument();
    });
  });
});
