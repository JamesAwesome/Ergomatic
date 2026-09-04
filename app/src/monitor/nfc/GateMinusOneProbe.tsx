import { useEffect, useRef, useState } from "react";
import {
  decodeNfcEvent,
  emitGateReceipt,
  matchAdvertisedName,
  PM5_NFC_TYPE_BYTES,
  type GateScenario,
  type NfcGateReceiptV1,
  type ReaderEndingAction,
  type ReaderEndingReason,
  type RedactedNfcRecord,
} from "./gateMinusOneReceipt";
// eslint-disable-next-line no-restricted-imports -- disposable native boundary
import {
  gateNativePort,
  type GateNfcStage,
  type GateRemoveListener,
} from "../../native/nfcGateMinusOneProbe";

interface Metadata {
  iphone: { model: string; iosVersion: string };
  pm5: { model: string; firmware: string; advertisedNameShown: string };
}
interface Active {
  attemptId: string;
  receiptIndex: number;
  scenario: GateScenario;
  metadata: Metadata;
  nfcRemovers: GateRemoveListener[];
  appRemover: GateRemoveListener | null;
  stageRemover: GateRemoveListener | null;
  nfcActive: boolean;
  bleActive: boolean;
  terminal: boolean;
  finalizing: boolean;
  payload: number[] | null;
  firstDeviceId: string | null;
  matchingIds: Set<string>;
  matchingCounts: Map<string, number>;
  matchingTimes: number[];
  scanStartedAt: number | null;
  selectedEnding: ReaderEndingAction | null;
}
interface ReloadMetadata {
  scenario: "webview-reload";
  priorAttemptId: string;
  priorStage: GateNfcStage;
  iphone: Metadata["iphone"];
  pm5: Metadata["pm5"];
}

const STORAGE_KEY = "ergomatic:nfc-gate-minus-one";
const USAGE = "Scan a PM5 to connect and program your workout.";
const ENDINGS = new Set<ReaderEndingReason>([
  "userCancelled",
  "sessionTimeout",
  "invalidated",
]);
const OVERLAY = new Set<GateScenario>([
  "stop-during-connect",
  "stop-during-query",
  "stop-during-read",
  "webview-reload",
]);
const now = () => performance.now();
const stageFor = (scenario: GateScenario): GateNfcStage | undefined =>
  scenario === "stop-during-query"
    ? "query"
    : scenario === "stop-during-read"
      ? "read"
      : scenario === "stop-during-connect" || scenario === "webview-reload"
        ? "connect"
        : undefined;
const exactType = (record: RedactedNfcRecord) =>
  record.tnf === 4 &&
  record.type.length === PM5_NFC_TYPE_BYTES.length &&
  record.type.every((byte, index) => byte === PM5_NFC_TYPE_BYTES[index]);

function attempt(scenario: GateScenario) {
  return {
    scenario,
    atUtc: new Date().toISOString(),
    capabilityLatencyMs: null,
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
  };
}
function document(metadata: Metadata): Omit<NfcGateReceiptV1, "verdict"> {
  return {
    schema: "ergomatic/nfc-gate-minus-one/v1",
    capturedAtUtc: new Date().toISOString(),
    iphone: { ...metadata.iphone },
    pm5: { ...metadata.pm5 },
    signedEntitlement: [],
    usageDescription: USAGE,
    package: "@capgo/capacitor-nfc@8.2.5",
    attempts: [],
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
function ending(
  value: unknown,
): { attemptId: string; reason: ReaderEndingReason | null } | null {
  if (typeof value !== "object" || value === null) return null;
  const event = value as { attemptId?: unknown; reason?: unknown };
  if (typeof event.attemptId !== "string" || event.attemptId === "")
    return null;
  return {
    attemptId: event.attemptId,
    reason:
      typeof event.reason === "string" &&
      ENDINGS.has(event.reason as ReaderEndingReason)
        ? (event.reason as ReaderEndingReason)
        : null,
  };
}
function progress(
  value: unknown,
): { attemptId: string; stage: GateNfcStage } | null {
  if (typeof value !== "object" || value === null) return null;
  const event = value as { attemptId?: unknown; stage?: unknown };
  if (
    typeof event.attemptId !== "string" ||
    (event.stage !== "connect" &&
      event.stage !== "query" &&
      event.stage !== "read")
  )
    return null;
  return { attemptId: event.attemptId, stage: event.stage };
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
  const [uiActive, setUiActive] = useState(false);
  const [activeScenario, setActiveScenario] = useState<GateScenario | null>(
    null,
  );
  const activeRef = useRef<Active | null>(null);
  const reloadRef = useRef<ReloadMetadata | null>(null);
  const owns = (active: Active) =>
    activeRef.current === active && !active.terminal;
  const update = (
    active: Active,
    fn: (entry: NfcGateReceiptV1["attempts"][number]) => void,
  ) =>
    setReceipt((current) => {
      if (
        current === null ||
        current.attempts[active.receiptIndex] === undefined
      )
        return current;
      const attempts = current.attempts.map((entry) => ({ ...entry }));
      fn(attempts[active.receiptIndex]!);
      return { ...current, attempts };
    });
  const stale = (active: Active) =>
    update(active, (entry) => {
      entry.staleIdDroppedCount += 1;
    });
  async function removeNfc(active: Active) {
    const removers = active.nfcRemovers.splice(0);
    await Promise.all(removers.map((remove) => remove()));
  }
  async function drain(active: Active, message?: string) {
    if (active.terminal) return;
    active.terminal = true;
    if (activeRef.current === active) activeRef.current = null;
    setUiActive(false);
    setActiveScenario(null);
    let failed = false;
    if (active.nfcActive) {
      active.nfcActive = false;
      try {
        await gateNativePort.stopNfc(active.attemptId);
      } catch {
        failed = true;
      }
    }
    try {
      await removeNfc(active);
    } catch {
      failed = true;
    }
    if (active.bleActive) {
      active.bleActive = false;
      try {
        await gateNativePort.stopBleScan();
      } catch {
        failed = true;
      }
    }
    try {
      await active.stageRemover?.();
    } catch {
      failed = true;
    }
    active.stageRemover = null;
    try {
      await active.appRemover?.();
    } catch {
      failed = true;
    }
    active.appRemover = null;
    if (message !== undefined)
      setStatus(
        failed
          ? "Cleanup failed; restart the diagnostic build before another sample."
          : message,
      );
  }
  async function completeScan(active: Active) {
    if (!owns(active) || active.finalizing) return;
    active.finalizing = true;
    active.bleActive = false;
    try {
      await gateNativePort.stopBleScan();
      if (!owns(active)) return;
      update(active, (entry) => {
        entry.matchingDeviceCount = active.matchingIds.size;
      });
      if (active.matchingIds.size !== 1 || active.firstDeviceId === null) {
        await drain(
          active,
          "BLE collision observed; connection intentionally blocked.",
        );
        return;
      }
      const deviceId = active.firstDeviceId;
      await gateNativePort.connectBle(deviceId, () => undefined);
      if (!owns(active)) {
        await gateNativePort.disconnectBle(deviceId).catch(() => undefined);
        return;
      }
      update(active, (entry) => {
        entry.connected = true;
      });
      await gateNativePort.disconnectBle(deviceId);
      if (!owns(active)) return;
      update(active, (entry) => {
        entry.disconnected = true;
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
      await drain(active, "BLE connect and disconnect observed.");
    } catch {
      await drain(
        active,
        "BLE scan/connect failed; next sample is available after cleanup.",
      );
    }
  }
  async function startBle(active: Active) {
    if (!owns(active)) return;
    if (
      (await gateNativePort.currentAppState()) !== "foreground" ||
      !owns(active)
    ) {
      await drain(active, "App is backgrounded; BLE was not armed.");
      return;
    }
    await gateNativePort.initializeBle();
    if (!owns(active)) return;
    if (!(await gateNativePort.isBleEnabled()) || !owns(active)) {
      await drain(active, "Bluetooth is disabled; no scan started.");
      return;
    }
    active.scanStartedAt = now();
    active.bleActive = true;
    await gateNativePort.startUnfilteredBleScan((value) => {
      if (
        !owns(active) ||
        active.finalizing ||
        active.payload === null ||
        typeof value !== "object" ||
        value === null
      )
        return;
      const result = value as {
        localName?: unknown;
        device?: { deviceId?: unknown };
      };
      const deviceId = result.device?.deviceId;
      const localName = result.localName;
      if (
        typeof deviceId !== "string" ||
        typeof localName !== "string" ||
        localName !== active.metadata.pm5.advertisedNameShown
      )
        return;
      const matched = matchAdvertisedName(active.payload, localName);
      if (matched === null) return;
      const elapsed = now() - active.scanStartedAt!;
      active.matchingTimes.push(elapsed);
      active.matchingIds.add(deviceId);
      active.matchingCounts.set(
        deviceId,
        (active.matchingCounts.get(deviceId) ?? 0) + 1,
      );
      if (active.firstDeviceId === null) active.firstDeviceId = deviceId;
      update(active, (entry) => {
        entry.decodedName = matched.decodedName;
        entry.liveLocalName = localName;
        entry.trailingPayloadBytes = matched.trailingPayloadBytes;
        entry.firstMatchingAdvertisementMs = active.matchingTimes[0] ?? null;
        entry.matchingAdvertisementIntervalsMs = active.matchingTimes
          .slice(1)
          .map((time, index) => time - active.matchingTimes[index]!);
        entry.matchingDeviceCount = active.matchingIds.size;
      });
      if ((active.matchingCounts.get(deviceId) ?? 0) >= 2)
        void completeScan(active);
    });
    if (!owns(active)) {
      await gateNativePort.stopBleScan().catch(() => undefined);
      return;
    }
    setStatus("Scanning for the PM5's exact local name.");
  }
  async function handleNfc(active: Active, value: unknown) {
    if (!owns(active)) return;
    let decoded;
    try {
      decoded = decodeNfcEvent(value);
    } catch {
      setStatus("Malformed NFC event.");
      return;
    }
    if (decoded.attemptId !== active.attemptId) {
      stale(active);
      return;
    }
    update(active, (entry) => {
      entry.records = decoded.records;
    });
    try {
      await gateNativePort.stopNfc(active.attemptId);
    } catch {
      await drain(
        active,
        "NFC stop failed; restart the diagnostic build before another sample.",
      );
      return;
    }
    active.nfcActive = false;
    try {
      await removeNfc(active);
    } catch {
      await drain(
        active,
        "NFC listener cleanup failed; restart the diagnostic build before another sample.",
      );
      return;
    }
    if (!owns(active)) return;
    const record = decoded.records.find(exactType);
    if (record === undefined) {
      await drain(
        active,
        "No exact PM5 NFC external-type record was observed.",
      );
      return;
    }
    active.payload = record.payload;
    setReceipt((current) =>
      current === null
        ? current
        : {
            ...current,
            criteria: {
              ...current.criteria,
              rawNdefShape: true,
              exactType: true,
            },
          },
    );
    await startBle(active);
  }
  async function addOverlay(active: Active) {
    if (!OVERLAY.has(active.scenario)) return;
    const wanted = stageFor(active.scenario)!;
    const remover = await gateNativePort.onGateProgress((value) => {
      const event = progress(value);
      if (event === null || event.attemptId !== active.attemptId) {
        stale(active);
        return;
      }
      if (event.stage !== wanted) return;
      if (active.scenario === "webview-reload")
        setStatus(
          "A reached the held stage. Verify the partial receipt in the controller console, then reload.",
        );
      else
        void drain(
          active,
          `Observed ${event.stage}; A was stopped and drained.`,
        );
    });
    if (!owns(active)) {
      await remover().catch(() => undefined);
      return;
    }
    active.stageRemover = remover;
  }
  async function runScenario(scenario: GateScenario) {
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
    const current = receipt ?? document(metadata);
    const active: Active = {
      attemptId: crypto.randomUUID(),
      receiptIndex: current.attempts.length,
      scenario,
      metadata,
      nfcRemovers: [],
      appRemover: null,
      stageRemover: null,
      nfcActive: false,
      bleActive: false,
      terminal: false,
      finalizing: false,
      payload: null,
      firstDeviceId: null,
      matchingIds: new Set(),
      matchingCounts: new Map(),
      matchingTimes: [],
      scanStartedAt: null,
      selectedEnding: null,
    };
    activeRef.current = active;
    setUiActive(true);
    setActiveScenario(scenario);
    setReceipt({
      ...current,
      attempts: [...current.attempts, attempt(scenario)],
    });
    const started = now();
    try {
      const supported = await gateNativePort.isNfcSupported();
      if (!owns(active)) return;
      update(active, (entry) => {
        entry.capabilityLatencyMs = now() - started;
      });
      if (!supported) {
        await drain(active, "NFC is not supported on this device.");
        return;
      }
      const appRemover = await gateNativePort.onAppState((state) => {
        if (state === "background")
          void drain(active, "App backgrounded; radio operations drained.");
      });
      if (!owns(active)) {
        await appRemover().catch(() => undefined);
        return;
      }
      active.appRemover = appRemover;
      const nfcRemover = await gateNativePort.onNfcEvent((event) => {
        void handleNfc(active, event);
      });
      if (!owns(active)) {
        await nfcRemover().catch(() => undefined);
        return;
      }
      active.nfcRemovers.push(nfcRemover);
      const endingRemover = await gateNativePort.onNfcSessionEnd((value) => {
        const event = ending(value);
        if (event === null || event.attemptId !== active.attemptId) {
          stale(active);
          return;
        }
        setReceipt((state) =>
          state === null
            ? state
            : {
                ...state,
                readerEndings: [
                  ...state.readerEndings,
                  {
                    action: active.selectedEnding ?? "forced-invalidation",
                    observedReason: event.reason,
                  },
                ],
                criteria: {
                  ...state.criteria,
                  readerEndingSemanticsObserved:
                    event.reason !== null ||
                    state.criteria.readerEndingSemanticsObserved,
                },
              },
        );
        void drain(active, "NFC reader session ended.");
      });
      if (!owns(active)) {
        await endingRemover().catch(() => undefined);
        return;
      }
      active.nfcRemovers.push(endingRemover);
      await addOverlay(active);
      if (
        !owns(active) ||
        (await gateNativePort.currentAppState()) !== "foreground"
      ) {
        await drain(active, "App is backgrounded; NFC was not armed.");
        return;
      }
      active.nfcActive = true;
      const stage = stageFor(scenario);
      await gateNativePort.startNfc({
        attemptId: active.attemptId,
        alertMessage: "Hold your iPhone near the PM5.",
        ...(stage === undefined ? {} : { gateMinusOneHoldStage: stage }),
      });
      if (!owns(active)) {
        await gateNativePort.stopNfc(active.attemptId).catch(() => undefined);
        return;
      }
      const prior = reloadRef.current;
      if (scenario === "webview-reload" && prior !== null) {
        reloadRef.current = null;
        await gateNativePort.releaseGateProgress(
          prior.priorAttemptId,
          prior.priorStage,
        );
      }
      setStatus("Hold your iPhone near the PM5.");
    } catch {
      await drain(
        active,
        "NFC setup failed; next sample is available after cleanup.",
      );
    }
  }
  async function selectEnding(action: ReaderEndingAction) {
    const active = activeRef.current;
    if (active === null || !owns(active)) return;
    active.selectedEnding = action;
    if (action === "sheet-cancel")
      await drain(
        active,
        "Reader sheet cancellation selected; observe its native ending if emitted.",
      );
    else
      setStatus(
        `${action} selected; complete that genuine reader path on device.`,
      );
  }
  function reloadWebView() {
    const active = activeRef.current;
    const stage = active === null ? undefined : stageFor(active.scenario);
    if (
      active === null ||
      active.scenario !== "webview-reload" ||
      stage === undefined ||
      receipt === null
    )
      return;
    emitGateReceipt(receipt);
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        scenario: "webview-reload",
        priorAttemptId: active.attemptId,
        priorStage: stage,
        iphone: active.metadata.iphone,
        pm5: active.metadata.pm5,
      } satisfies ReloadMetadata),
    );
    location.reload();
  }
  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    if (raw === null) return undefined;
    try {
      const parsed = JSON.parse(raw) as Partial<ReloadMetadata>;
      if (
        parsed.scenario !== "webview-reload" ||
        typeof parsed.priorAttemptId !== "string" ||
        (parsed.priorStage !== "connect" &&
          parsed.priorStage !== "query" &&
          parsed.priorStage !== "read") ||
        parsed.iphone === undefined ||
        parsed.pm5 === undefined
      )
        return undefined;
      reloadRef.current = parsed as ReloadMetadata;
      const timer = window.setTimeout(() => {
        setIphoneModel(parsed.iphone!.model);
        setIosVersion(parsed.iphone!.iosVersion);
        setPm5Model(parsed.pm5!.model);
        setPm5Firmware(parsed.pm5!.firmware);
        setAdvertisedName(parsed.pm5!.advertisedNameShown);
        setStatus(
          "Partial receipt exported. Start B, then A's held continuation will be released.",
        );
      }, 0);
      return () => window.clearTimeout(timer);
    } catch {
      /* discard malformed opaque reload metadata */
    }
    return undefined;
  }, []);
  // The cleanup intentionally owns the mount's current attempt; re-subscribing
  // on each render would race the same native handles it is draining.
  useEffect(
    () => () => {
      const active = activeRef.current;
      if (active !== null) void drain(active);
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps -- mount-owned native drain
  );
  const complete = Boolean(
    iphoneModel.trim() &&
    iosVersion.trim() &&
    pm5Model.trim() &&
    pm5Firmware.trim() &&
    advertisedName.trim(),
  );
  const latest = receipt?.attempts.at(-1) ?? null;
  const scenarios: GateScenario[] = [
    "normal",
    "stop-during-connect",
    "stop-during-query",
    "stop-during-read",
    "background",
    "webview-reload",
  ];
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
        {scenarios.map((scenario) => (
          <button
            type="button"
            key={scenario}
            disabled={!complete || uiActive}
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
        disabled={!uiActive}
        onClick={() =>
          void drain(activeRef.current!, "Sample cancelled and drained.")
        }
      >
        Cancel sample
      </button>
      <button
        type="button"
        disabled={!uiActive}
        onClick={() => void selectEnding("sheet-cancel")}
      >
        Sheet cancel
      </button>
      <button
        type="button"
        disabled={!uiActive}
        onClick={() => void selectEnding("no-tag-timeout")}
      >
        No-tag timeout
      </button>
      <button
        type="button"
        disabled={!uiActive}
        onClick={() => void selectEnding("forced-invalidation")}
      >
        Forced invalidation
      </button>
      {activeScenario === "webview-reload" ? (
        <button type="button" onClick={reloadWebView}>
          Reload WebView
        </button>
      ) : null}
      <p>{status}</p>
      <p>{`Matching device count: ${latest?.matchingDeviceCount ?? 0}`}</p>
      {latest === null ? null : (
        <>
          <p>{`Raw NFC records: ${JSON.stringify(latest.records)}`}</p>
          <button
            type="button"
            onClick={() => {
              if (receipt !== null) {
                const json = emitGateReceipt(receipt);
                void navigator.clipboard.writeText(json);
              }
            }}
          >
            Copy redacted receipt
          </button>
        </>
      )}
    </section>
  );
}
