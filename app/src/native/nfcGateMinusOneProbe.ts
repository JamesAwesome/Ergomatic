import { App } from "@capacitor/app";
import { BleClient } from "@capacitor-community/bluetooth-le";
import { registerPlugin } from "@capacitor/core";
import { CapacitorNfc } from "@capgo/capacitor-nfc";
import type { StartScanningOptions } from "@capgo/capacitor-nfc";

export type GateNfcStage = "connect" | "query" | "read";
export type GateRemoveListener = () => Promise<void>;

export interface GateNativePort {
  isNfcSupported(): Promise<boolean>;
  onNfcEvent(listener: (event: unknown) => void): Promise<GateRemoveListener>;
  onNfcSessionEnd(
    listener: (event: unknown) => void,
  ): Promise<GateRemoveListener>;
  currentAppState(): Promise<"foreground" | "background">;
  onAppState(
    listener: (state: "foreground" | "background") => void,
  ): Promise<GateRemoveListener>;
  startNfc(options: {
    attemptId: string;
    alertMessage: string;
    gateMinusOneHoldStage?: GateNfcStage;
  }): Promise<void>;
  stopNfc(attemptId: string): Promise<void>;
  initializeBle(): Promise<void>;
  isBleEnabled(): Promise<boolean>;
  startUnfilteredBleScan(listener: (result: unknown) => void): Promise<void>;
  stopBleScan(): Promise<void>;
  connectBle(deviceId: string, onDisconnect: () => void): Promise<void>;
  disconnectBle(deviceId: string): Promise<void>;
  onGateProgress(
    listener: (event: unknown) => void,
  ): Promise<GateRemoveListener>;
  releaseGateProgress(attemptId: string, stage: GateNfcStage): Promise<void>;
}

interface GateNfcOverlayBridge {
  addListener(
    eventName: "nfcGateProgress",
    listener: (event: unknown) => void,
  ): Promise<{ remove(): Promise<void> }>;
  releaseNfcGateProgress(options: {
    attemptId: string;
    stage: GateNfcStage;
  }): Promise<void>;
}

const gateNfcOverlay = registerPlugin<GateNfcOverlayBridge>("CapacitorNfc");

export const gateNativePort: GateNativePort = {
  async isNfcSupported() {
    return (await CapacitorNfc.isSupported()).supported;
  },
  async onNfcEvent(listener) {
    const handle = await CapacitorNfc.addListener("nfcEvent", listener);
    return async () => handle.remove();
  },
  async onNfcSessionEnd(listener) {
    const handle = await CapacitorNfc.addListener("nfcSessionEnd", listener);
    return async () => handle.remove();
  },
  async currentAppState() {
    return (await App.getState()).isActive ? "foreground" : "background";
  },
  async onAppState(listener) {
    const pause = await App.addListener("pause", () => listener("background"));
    try {
      const resume = await App.addListener("resume", () =>
        listener("foreground"),
      );
      return async () => {
        await Promise.all([pause.remove(), resume.remove()]);
      };
    } catch (error: unknown) {
      await pause.remove();
      throw error;
    }
  },
  async startNfc(options) {
    const nativeOptions: StartScanningOptions & {
      gateMinusOneHoldStage?: GateNfcStage;
    } = {
      attemptId: options.attemptId,
      alertMessage: options.alertMessage,
      iosSessionType: "ndef",
      invalidateAfterFirstRead: false,
      ...(options.gateMinusOneHoldStage
        ? { gateMinusOneHoldStage: options.gateMinusOneHoldStage }
        : {}),
    };
    await CapacitorNfc.startScanning(nativeOptions);
  },
  async stopNfc(attemptId) {
    await CapacitorNfc.stopScanning({ attemptId });
  },
  async initializeBle() {
    await BleClient.initialize();
  },
  async isBleEnabled() {
    return BleClient.isEnabled();
  },
  async startUnfilteredBleScan(listener) {
    await BleClient.requestLEScan({ allowDuplicates: true }, listener);
  },
  async stopBleScan() {
    await BleClient.stopLEScan();
  },
  async connectBle(deviceId, onDisconnect) {
    await BleClient.connect(deviceId, onDisconnect);
  },
  async disconnectBle(deviceId) {
    await BleClient.disconnect(deviceId);
  },
  async onGateProgress(listener) {
    const handle = await gateNfcOverlay.addListener(
      "nfcGateProgress",
      listener,
    );
    return async () => handle.remove();
  },
  async releaseGateProgress(attemptId, stage) {
    await gateNfcOverlay.releaseNfcGateProgress({ attemptId, stage });
  },
};
