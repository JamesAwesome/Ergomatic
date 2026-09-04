import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
  reset() {
    this.calls.length = 0;
    this.nfcEvent = undefined;
    this.nfcSessionEnd = undefined;
    this.bleResult = undefined;
    this.appState = undefined;
    this.appPause = undefined;
    this.stoppedBle = false;
    this.matchingIds.clear();
  },
}));

vi.mock("@capgo/capacitor-nfc", () => ({
  CapacitorNfc: {
    isSupported: async () => {
      native.calls.push("nfc-capability");
      return { supported: true };
    },
    addListener: async (name: string, listener: NfcListener) => {
      native.calls.push(`nfc-listener:${name}`);
      if (name === "nfcEvent") native.nfcEvent = listener;
      if (name === "nfcSessionEnd") native.nfcSessionEnd = listener;
      return {
        remove: async () => {
          if (name === "nfcSessionEnd")
            native.calls.push("nfc-listeners-removed");
        },
      };
    },
    startScanning: async (options: { attemptId: string }) => {
      native.calls.push(`nfc-start:${options.attemptId}`);
    },
    stopScanning: async (options: { attemptId: string }) => {
      native.calls.push(`nfc-stop:${options.attemptId}`);
    },
  },
}));

vi.mock("@capacitor-community/bluetooth-le", () => ({
  BleClient: {
    initialize: async () => native.calls.push("ble-initialize"),
    isEnabled: async () => {
      native.calls.push("ble-enabled");
      return true;
    },
    requestLEScan: async (
      options: { allowDuplicates: boolean },
      listener: BleListener,
    ) => {
      native.calls.push(
        `ble-requestLEScan:unfiltered:${options.allowDuplicates ? "duplicates" : "single"}`,
      );
      native.bleResult = listener;
    },
    stopLEScan: async () => {
      native.calls.push("ble-stopLEScan");
      native.stoppedBle = true;
    },
    connect: async (deviceId: string) =>
      native.calls.push(`ble-connect:${deviceId}`),
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
      return { remove: async () => undefined };
    },
    getState: async () => {
      native.calls.push("app-state:foreground");
      return { isActive: true };
    },
  },
}));

afterEach(() => {
  native.reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
  vi.stubGlobal("crypto", { randomUUID: () => "attempt-a" });
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

async function beginThroughBle(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Run normal sample" }));
  await waitFor(() => expect(native.nfcEvent).toBeTypeOf("function"));
  await act(async () => {
    native.nfcEvent!(nfcEvent());
  });
  await waitFor(() => expect(native.bleResult).toBeTypeOf("function"));
}

describe("GateMinusOneProbe", () => {
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
      expect(stopBleScan).toHaveBeenCalledOnce();
      expect(screen.getByText(/BLE scan\/connect failed/)).toBeInTheDocument();
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
