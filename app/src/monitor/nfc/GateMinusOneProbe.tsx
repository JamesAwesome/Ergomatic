import { useEffect, useRef, useState } from "react";
import {
  decodeNfcEvent,
  matchAdvertisedName,
  PM5_NFC_TYPE_BYTES,
  serializeGateReceipt,
  type NfcGateReceiptV1,
  type RedactedNfcRecord,
} from "./gateMinusOneReceipt";
// The disposable probe's injected boundary intentionally lives in native/;
// it does not import a Capacitor package into this component.
// eslint-disable-next-line no-restricted-imports
import {
  gateNativePort,
  type GateNfcStage,
  type GateRemoveListener,
} from "../../native/nfcGateMinusOneProbe";

type Scenario =
  | "normal"
  | "stop-during-connect"
  | "stop-during-query"
  | "stop-during-read"
  | "reload"
  | "stress";

interface Metadata {
  iphone: { model: string; iosVersion: string };
  pm5: { model: string; firmware: string; advertisedNameShown: string };
}

interface ActiveAttempt {
  attemptId: string;
  scenario: Scenario;
  metadata: Metadata;
  nfcRemovers: GateRemoveListener[];
  appRemover: GateRemoveListener | null;
  nfcActive: boolean;
  bleActive: boolean;
  finalizing: boolean;
  payload: number[] | null;
  firstDeviceId: string | null;
  matchingIds: Set<string>;
  matchingCounts: Map<string, number>;
  scanStartedAt: number | null;
  matchingTimes: number[];
}

const STORAGE_KEY = "ergomatic:nfc-gate-minus-one";
const USAGE_DESCRIPTION = "Scan a PM5 to connect and program your workout.";

function monotonicNow(): number {
  return performance.now();
}

function stageForScenario(scenario: Scenario): GateNfcStage | undefined {
  if (scenario === "stop-during-connect") return "connect";
  if (scenario === "stop-during-query") return "query";
  if (scenario === "stop-during-read") return "read";
  return undefined;
}

function nfcTypeMatches(record: RedactedNfcRecord): boolean {
  return (
    record.tnf === 4 &&
    record.type.length === PM5_NFC_TYPE_BYTES.length &&
    record.type.every((byte, index) => byte === PM5_NFC_TYPE_BYTES[index])
  );
}

function emptyReceipt(
  metadata: Metadata,
  scenario: Scenario,
  capabilityLatencyMs: number,
): Omit<NfcGateReceiptV1, "verdict"> {
  return {
    schema: "ergomatic/nfc-gate-minus-one/v1",
    capturedAtUtc: new Date().toISOString(),
    iphone: {
      model: metadata.iphone.model,
      iosVersion: metadata.iphone.iosVersion,
    },
    pm5: {
      model: metadata.pm5.model,
      firmware: metadata.pm5.firmware,
      advertisedNameShown: metadata.pm5.advertisedNameShown,
    },
    signedEntitlement: [],
    usageDescription: USAGE_DESCRIPTION,
    package: "@capgo/capacitor-nfc@8.2.5",
    attempts: [
      {
        scenario,
        atUtc: new Date().toISOString(),
        capabilityLatencyMs,
        records: [],
        decodedName: null,
        liveLocalName: null,
        trailingPayloadBytes: [],
        firstMatchingAdvertisementMs: null,
        matchingAdvertisementIntervalsMs: [],
        matchingDeviceCount: 0,
        connected: false,
        disconnected: false,
        staleIdDroppedCount: 0,
        staleAttemptSettlementCount: 0,
      },
    ],
    readerEndings: [],
    criteria: {
      rawNdefShape: false,
      exactType: false,
      paddingRuleObserved: false,
      exactLocalNameBridge: false,
      pickerFreeBleConnect: false,
      signedReader: false,
      readerEndingSemanticsObserved: false,
      nativeIdentityAndDrain: false,
      staleACannotAffectB: false,
    },
  };
}

function firstAttempt(receipt: Omit<NfcGateReceiptV1, "verdict">) {
  return receipt.attempts[0]!;
}

export default function GateMinusOneProbe() {
  const [iphoneModel, setIphoneModel] = useState("");
  const [iosVersion, setIosVersion] = useState("");
  const [pm5Model, setPm5Model] = useState("");
  const [pm5Firmware, setPm5Firmware] = useState("");
  const [advertisedName, setAdvertisedName] = useState("");
  const [receipt, setReceipt] = useState<Omit<
    NfcGateReceiptV1,
    "verdict"
  > | null>(null);
  const [status, setStatus] = useState(
    "Enter the device metadata to arm a sample.",
  );
  const [scanError, setScanError] = useState<string | null>(null);
  const [uiActivity, setUiActivity] = useState<{
    scenario: Scenario;
    bleActive: boolean;
  } | null>(null);
  const activeRef = useRef<ActiveAttempt | null>(null);
  const priorAttemptIdRef = useRef<string | null>(null);

  function updateAttempt(
    update: (attempt: NfcGateReceiptV1["attempts"][number]) => void,
  ) {
    setReceipt((current) => {
      if (current === null) return current;
      const next = {
        ...current,
        attempts: current.attempts.map((attempt) => ({ ...attempt })),
        criteria: { ...current.criteria },
      };
      update(firstAttempt(next));
      return next;
    });
  }

  async function removeNfcListeners(active: ActiveAttempt): Promise<void> {
    const removers = active.nfcRemovers.splice(0);
    await Promise.all(removers.map(async (remove) => remove()));
  }

  async function removeAppListener(active: ActiveAttempt): Promise<void> {
    const remove = active.appRemover;
    active.appRemover = null;
    if (remove !== null) await remove();
  }

  async function abortAndDrain(active: ActiveAttempt): Promise<void> {
    if (active.nfcActive) {
      active.nfcActive = false;
      try {
        await gateNativePort.stopNfc(active.attemptId);
      } catch {
        // The receipt documents observed failures; cleanup still continues.
      }
    }
    await removeNfcListeners(active);
    if (active.bleActive) {
      active.bleActive = false;
      try {
        await gateNativePort.stopBleScan();
      } catch {
        // There is no safe connect after a stop failure.
      }
    }
    await removeAppListener(active);
    if (activeRef.current === active) activeRef.current = null;
    setUiActivity(null);
  }

  async function completeScan(active: ActiveAttempt): Promise<void> {
    if (active.finalizing) return;
    active.finalizing = true;
    active.bleActive = false;
    setUiActivity({ scenario: active.scenario, bleActive: false });
    try {
      await gateNativePort.stopBleScan();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setScanError(`Scan stop failed: ${message}`);
      updateAttempt((attempt) => {
        attempt.matchingDeviceCount = active.matchingIds.size;
      });
      await removeAppListener(active);
      setUiActivity(null);
      return;
    }

    updateAttempt((attempt) => {
      attempt.matchingDeviceCount = active.matchingIds.size;
    });
    if (active.matchingIds.size !== 1 || active.firstDeviceId === null) {
      setStatus("BLE collision observed; connection intentionally blocked.");
      await removeAppListener(active);
      setUiActivity(null);
      return;
    }

    try {
      await gateNativePort.connectBle(active.firstDeviceId, () => undefined);
      updateAttempt((attempt) => {
        attempt.connected = true;
      });
      await gateNativePort.disconnectBle(active.firstDeviceId);
      updateAttempt((attempt) => {
        attempt.disconnected = true;
        attempt.matchingDeviceCount = 1;
      });
      setReceipt((current) =>
        current === null
          ? current
          : {
              ...current,
              criteria: {
                ...current.criteria,
                pickerFreeBleConnect: true,
                nativeIdentityAndDrain: true,
              },
            },
      );
      setStatus("BLE connect and disconnect observed.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`BLE connect/disconnect failed: ${message}`);
    } finally {
      await removeAppListener(active);
      if (activeRef.current === active) activeRef.current = null;
      setUiActivity(null);
    }
  }

  async function startBle(active: ActiveAttempt): Promise<void> {
    if (activeRef.current !== active) return;
    if ((await gateNativePort.currentAppState()) !== "foreground") {
      setStatus("App is backgrounded; BLE was not armed.");
      await abortAndDrain(active);
      return;
    }
    await gateNativePort.initializeBle();
    if (!(await gateNativePort.isBleEnabled())) {
      setStatus("Bluetooth is disabled; no scan started.");
      await removeAppListener(active);
      return;
    }
    active.scanStartedAt = monotonicNow();
    active.bleActive = true;
    setUiActivity({ scenario: active.scenario, bleActive: true });
    await gateNativePort.startUnfilteredBleScan((result) => {
      if (
        activeRef.current !== active ||
        active.finalizing ||
        active.payload === null
      )
        return;
      if (typeof result !== "object" || result === null) return;
      const candidate = result as { deviceId?: unknown; localName?: unknown };
      if (typeof candidate.deviceId !== "string") return;
      const localName = candidate.localName;
      if (typeof localName !== "string") return;
      if (localName !== active.metadata.pm5.advertisedNameShown) return;
      const match = matchAdvertisedName(active.payload, localName);
      if (match === null) return;

      const elapsed = monotonicNow() - active.scanStartedAt!;
      active.matchingTimes.push(elapsed);
      active.matchingIds.add(candidate.deviceId);
      active.matchingCounts.set(
        candidate.deviceId,
        (active.matchingCounts.get(candidate.deviceId) ?? 0) + 1,
      );
      if (active.firstDeviceId === null)
        active.firstDeviceId = candidate.deviceId;
      updateAttempt((attempt) => {
        attempt.decodedName = match.decodedName;
        attempt.liveLocalName = localName;
        attempt.trailingPayloadBytes = match.trailingPayloadBytes;
        attempt.firstMatchingAdvertisementMs = active.matchingTimes[0] ?? null;
        attempt.matchingAdvertisementIntervalsMs = active.matchingTimes
          .slice(1)
          .map((value, index) => value - active.matchingTimes[index]!);
        attempt.matchingDeviceCount = active.matchingIds.size;
      });

      if ((active.matchingCounts.get(candidate.deviceId) ?? 0) >= 2) {
        void completeScan(active);
      }
    });
    setStatus("Scanning for the PM5's exact local name.");
  }

  async function handleNfcEvent(
    active: ActiveAttempt,
    value: unknown,
  ): Promise<void> {
    if (activeRef.current !== active) return;
    let decoded;
    try {
      decoded = decodeNfcEvent(value);
    } catch (error: unknown) {
      setStatus(
        error instanceof Error ? error.message : "Malformed NFC event.",
      );
      return;
    }
    if (decoded.attemptId !== active.attemptId) return;
    updateAttempt((attempt) => {
      attempt.records = decoded.records;
    });
    try {
      await gateNativePort.stopNfc(active.attemptId);
    } finally {
      active.nfcActive = false;
      await removeNfcListeners(active);
    }
    const pm5Record = decoded.records.find(nfcTypeMatches);
    if (pm5Record === undefined) {
      setStatus("No exact PM5 NFC external-type record was observed.");
      await removeAppListener(active);
      return;
    }
    active.payload = pm5Record.payload;
    setReceipt((current) =>
      current === null
        ? current
        : {
            ...current,
            criteria: {
              ...current.criteria,
              rawNdefShape: true,
              exactType: true,
              paddingRuleObserved: pm5Record.payload.length >= 7,
            },
          },
    );
    await startBle(active);
  }

  async function runScenario(scenario: Scenario): Promise<void> {
    if (activeRef.current !== null) return;
    const metadata: Metadata = {
      iphone: { model: iphoneModel.trim(), iosVersion: iosVersion.trim() },
      pm5: {
        model: pm5Model.trim(),
        firmware: pm5Firmware.trim(),
        advertisedNameShown: advertisedName.trim(),
      },
    };
    if (
      !metadata.iphone.model ||
      !metadata.iphone.iosVersion ||
      !metadata.pm5.model ||
      !metadata.pm5.firmware ||
      !metadata.pm5.advertisedNameShown
    )
      return;

    setScanError(null);
    const attemptId = crypto.randomUUID();
    const active: ActiveAttempt = {
      attemptId,
      scenario,
      metadata,
      nfcRemovers: [],
      appRemover: null,
      nfcActive: false,
      bleActive: false,
      finalizing: false,
      payload: null,
      firstDeviceId: null,
      matchingIds: new Set(),
      matchingCounts: new Map(),
      scanStartedAt: null,
      matchingTimes: [],
    };
    activeRef.current = active;
    setUiActivity({ scenario, bleActive: false });
    setStatus("Checking NFC capability.");
    const capabilityStartedAt = monotonicNow();
    try {
      const supported = await gateNativePort.isNfcSupported();
      const capabilityLatencyMs = monotonicNow() - capabilityStartedAt;
      setReceipt(emptyReceipt(metadata, scenario, capabilityLatencyMs));
      if (!supported) {
        setStatus("NFC is not supported on this device.");
        activeRef.current = null;
        setUiActivity(null);
        return;
      }
      active.appRemover = await gateNativePort.onAppState((state) => {
        if (state === "background") void abortAndDrain(active);
      });
      active.nfcRemovers.push(
        await gateNativePort.onNfcEvent((event) => {
          void handleNfcEvent(active, event);
        }),
      );
      active.nfcRemovers.push(
        await gateNativePort.onNfcSessionEnd((event) => {
          const reason =
            typeof event === "object" && event !== null && "reason" in event
              ? String((event as { reason: unknown }).reason)
              : null;
          setReceipt((current) =>
            current === null
              ? current
              : {
                  ...current,
                  readerEndings: [
                    ...current.readerEndings,
                    { action: "forced-invalidation", observedReason: reason },
                  ],
                },
          );
        }),
      );
      if ((await gateNativePort.currentAppState()) !== "foreground") {
        setStatus("App is backgrounded; NFC was not armed.");
        await abortAndDrain(active);
        return;
      }
      active.nfcActive = true;
      const holdStage = stageForScenario(scenario);
      await gateNativePort.startNfc({
        attemptId,
        alertMessage: "Hold your iPhone near the PM5.",
        ...(holdStage === undefined
          ? {}
          : { gateMinusOneHoldStage: holdStage }),
      });
      setStatus("Hold your iPhone near the PM5.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`NFC setup failed: ${message}`);
      await abortAndDrain(active);
    }
  }

  async function cancelSample(): Promise<void> {
    const active = activeRef.current;
    if (active === null || !active.bleActive || active.finalizing) return;
    active.finalizing = true;
    active.bleActive = false;
    setUiActivity({ scenario: active.scenario, bleActive: false });
    try {
      await gateNativePort.stopBleScan();
      setStatus("Sample cancelled before a second matching advertisement.");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setScanError(`Scan stop failed: ${message}`);
    } finally {
      updateAttempt((attempt) => {
        attempt.matchingDeviceCount = active.matchingIds.size;
      });
      await removeAppListener(active);
      if (activeRef.current === active) activeRef.current = null;
      setUiActivity(null);
    }
  }

  async function copyReceipt(): Promise<void> {
    if (receipt === null) return;
    const json = serializeGateReceipt(receipt);
    await navigator.clipboard.writeText(json);
    console.info(`NFC_GATE_RECEIPT ${json}`);
  }

  function reloadWebView(): void {
    const active = activeRef.current;
    if (
      active === null ||
      (active.scenario !== "reload" && active.scenario !== "stress")
    )
      return;
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        scenario: active.scenario,
        reloadPending: true,
        priorAttemptId: active.attemptId,
        iphone: active.metadata.iphone,
        pm5: active.metadata.pm5,
      }),
    );
    location.reload();
  }

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (raw === null) return;
    try {
      const parsed = JSON.parse(raw) as { priorAttemptId?: unknown };
      if (
        typeof parsed.priorAttemptId !== "string" ||
        parsed.priorAttemptId === ""
      )
        return;
      priorAttemptIdRef.current = parsed.priorAttemptId;
      void Promise.all(
        (["connect", "query", "read"] as const).map((stage) =>
          gateNativePort.releaseGateProgress(
            parsed.priorAttemptId as string,
            stage,
          ),
        ),
      ).catch(() => undefined);
    } catch {
      // Malformed stale diagnostic state is intentionally discarded.
    }
  }, []);

  useEffect(
    () => () => {
      const active = activeRef.current;
      if (active === null) return;
      void (async () => {
        if (active.nfcActive) {
          try {
            await gateNativePort.stopNfc(active.attemptId);
          } catch {
            // Continue draining every resolved listener and radio operation.
          }
        }
        await Promise.all(active.nfcRemovers.map(async (remove) => remove()));
        if (active.bleActive) {
          try {
            await gateNativePort.stopBleScan();
          } catch {
            // Teardown must not strand the app-state listener.
          }
        }
        if (active.appRemover !== null) await active.appRemover();
      })();
    },
    [],
  );

  const metadataComplete = Boolean(
    iphoneModel.trim() &&
    iosVersion.trim() &&
    pm5Model.trim() &&
    pm5Firmware.trim() &&
    advertisedName.trim(),
  );
  const first = receipt === null ? null : firstAttempt(receipt);

  return (
    <section data-nfc-gate-minus-one="NFC Gate -1 disposable device probe">
      <h2 className="section-heading">NFC GATE -1 PROBE</h2>
      <label>
        iPhone model
        <input
          value={iphoneModel}
          onChange={(event) => setIphoneModel(event.target.value)}
        />
      </label>
      <label>
        iOS version
        <input
          value={iosVersion}
          onChange={(event) => setIosVersion(event.target.value)}
        />
      </label>
      <label>
        PM5 model
        <input
          value={pm5Model}
          onChange={(event) => setPm5Model(event.target.value)}
        />
      </label>
      <label>
        PM5 firmware
        <input
          value={pm5Firmware}
          onChange={(event) => setPm5Firmware(event.target.value)}
        />
      </label>
      <label>
        PM5 advertised name
        <input
          value={advertisedName}
          onChange={(event) => setAdvertisedName(event.target.value)}
        />
      </label>
      <div>
        {(
          [
            "normal",
            "stop-during-connect",
            "stop-during-query",
            "stop-during-read",
            "reload",
            "stress",
          ] as const
        ).map((scenario) => (
          <button
            type="button"
            key={scenario}
            disabled={!metadataComplete || uiActivity !== null}
            onClick={() => void runScenario(scenario)}
          >
            {scenario === "normal"
              ? "Run normal sample"
              : `Run ${scenario} sample`}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={uiActivity?.bleActive !== true}
        onClick={() => void cancelSample()}
      >
        Cancel sample
      </button>
      {uiActivity?.scenario === "reload" ||
      uiActivity?.scenario === "stress" ? (
        <button type="button" onClick={reloadWebView}>
          Reload WebView
        </button>
      ) : null}
      <p>{status}</p>
      {scanError === null ? null : <p>{scanError}</p>}
      <p>{`Matching device count: ${first?.matchingDeviceCount ?? 0}`}</p>
      {first === null ? null : (
        <>
          <p>{`Raw NFC records: ${JSON.stringify(first.records)}`}</p>
          <button type="button" onClick={() => void copyReceipt()}>
            Copy redacted receipt
          </button>
        </>
      )}
    </section>
  );
}
