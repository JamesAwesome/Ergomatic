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
  nfcEvent: undefined as NfcListener | undefined,
  nfcSessionEnd: undefined as NfcListener | undefined,
  bleResult: undefined as BleListener | undefined,
  appState: undefined as AppListener | undefined,
  appPause: undefined as AppListener | undefined,
  stoppedBle: false,
  matchingIds: new Set<string>(),
  waits: new Map<string, Promise<void>>(),
  removed: [] as string[],
  progress: undefined as NfcListener | undefined,
  supported: true,
  enabled: true,
  nextId: 0,
  reset() {
    this.calls.length = 0;
    this.nfcEvent = undefined;
    this.nfcSessionEnd = undefined;
    this.bleResult = undefined;
    this.appState = undefined;
    this.appPause = undefined;
    this.stoppedBle = false;
    this.matchingIds.clear();
    this.waits.clear();
    this.removed.length = 0;
    this.progress = undefined;
    this.supported = true;
    this.enabled = true;
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
    disconnect: async (deviceId: string) =>
      native.calls.push(`ble-disconnect:${deviceId}`),
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (name: string, listener: AppListener) => {
      if (!native.calls.includes("app-listener"))
        native.calls.push("app-listener");
      if (name === "pause") native.appPause = listener;
      else native.appState = listener;
      await native.waits.get(name);
      return {
        remove: async () => {
          native.removed.push(name);
        },
      };
    },
    getState: async () => {
      native.calls.push("app-state:foreground");
      await native.waits.get("app-state");
      return { isActive: true };
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

describe("GateMinusOneProbe", () => {
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
    "exports stopped %s A before operator reload, starts B before releasing A, and rejects stale callbacks",
    async ({ scenario, stage }) => {
      const user = await renderReadyProbe();
      const reload = vi.fn();
      vi.stubGlobal("location", { reload });
      await user.click(
        screen.getByRole("button", { name: `Run ${scenario} sample` }),
      );
      await act(async () => {
        native.progress!({ attemptId: "attempt-a", stage });
      });
      await waitFor(() => expect(native.calls).toContain("nfc-stop:attempt-a"));
      const logger = vi.spyOn(console, "info").mockImplementation(() => {});
      await user.click(
        screen.getByRole("button", { name: "Export partial receipt" }),
      );
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
      await user.click(screen.getByRole("button", { name: "Reload WebView" }));
      expect(reload).toHaveBeenCalledOnce();
      const stored = sessionStorage.getItem("ergomatic:nfc-gate-minus-one")!;
      expect(stored).not.toMatch(/records|deviceId|receipt/);
      cleanup();
      const { default: Probe } = await import("./GateMinusOneProbe");
      render(<Probe />);
      expect(sessionStorage.getItem("ergomatic:nfc-gate-minus-one")).toBeNull();
      expect(native.calls).not.toContain(`release:attempt-a:${stage}`);
      await user.click(screen.getByRole("button", { name: "Start B" }));
      await waitFor(() =>
        expect(native.calls).toContain(`release:attempt-a:${stage}`),
      );
      expect(native.calls.indexOf("nfc-start:attempt-b")).toBeLessThan(
        native.calls.indexOf(`release:attempt-a:${stage}`),
      );
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
        staleAttemptSettlementCount: 0,
        staleIdDroppedCount: 3,
      });
      expect(complete.criteria.staleACannotAffectB).toBe(true);
    },
  );

  it("retains failures and repeated attempts and records only the selected genuine ending", async () => {
    const user = await renderReadyProbe();
    native.supported = false;
    await user.click(runButton());
    native.supported = true;
    await user.click(runButton());
    const staleEnd = native.nfcSessionEnd!;
    await user.click(screen.getByRole("button", { name: "Sheet cancel" }));
    expect(native.calls).not.toContain("nfc-stop:attempt-b");
    await act(async () => {
      native.nfcSessionEnd!({
        attemptId: "attempt-b",
        reason: "userCancelled",
      });
    });
    await user.click(runButton());
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
    await user.click(runButton());
    await user.click(
      screen.getByRole("button", { name: "Forced invalidation" }),
    );
    await act(async () => {
      native.nfcSessionEnd!({
        attemptId: "attempt-d",
        reason: "userCancelled",
      });
    });
    const result = await exported(user);
    expect(result.attempts).toHaveLength(4);
    expect(result.attempts[0]!.records).toStrictEqual([]);
    expect(result.readerEndings).toStrictEqual([
      { action: "sheet-cancel", observedReason: "userCancelled" },
      { action: "no-tag-timeout", observedReason: "sessionTimeout" },
      { action: "forced-invalidation", observedReason: "userCancelled" },
    ]);
    expect(result.criteria.readerEndingSemanticsObserved).toBe(true);
    expect(result.criteria.paddingRuleObserved).toBe(false);
    expect(result.signedEntitlement).toStrictEqual([]);
  });
  it("arms native NFC before BLE and connects only after two exact local-name advertisements", async () => {
    const user = await renderReadyProbe();
    await beginThroughBle(user);

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
        "app-state:foreground",
        "nfc-start:attempt-a",
        "nfc-stop:attempt-a",
        "nfc-listeners-removed",
        "app-state:foreground",
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
