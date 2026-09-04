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
interface ReloadMetadata extends Metadata {
  scenario: GateScenario;
  reloadPending: true;
  priorAttemptId: string;
  priorStage: GateNfcStage;
}
interface Active {
  attemptId: string;
  entry: NfcGateReceiptV1["attempts"][number];
  metadata: Metadata;
  pending: Set<Promise<unknown>>;
  nfcRemovers: GateRemoveListener[];
  otherRemovers: GateRemoveListener[];
  nfcActive: boolean;
  nfcReady: boolean;
  earlyNfcEvent: unknown;
  bleActive: boolean;
  scanReady: boolean;
  connectedDevice: string | null;
  terminal: boolean;
  drainPromise: Promise<void> | null;
  cleanupFailed: boolean;
  reading: boolean;
  finalizing: boolean;
  holdStage: GateNfcStage | undefined;
  priorReleased: boolean;
  payload: number[] | null;
  firstDeviceId: string | null;
  matchingIds: Set<string>;
  matchingCounts: Map<string, number>;
  matchingTimes: number[];
  scanStartedAt: number;
  selectedEnding: ReaderEndingAction | null;
}
const STORAGE_KEY = "ergomatic:nfc-gate-minus-one";
const now = () => performance.now();
const USAGE = "Scan a PM5 to connect and program your workout.";
const RESTART =
  "Cleanup failed; restart the diagnostic build before another sample.";
const SCENARIOS: GateScenario[] = [
  "normal",
  "stop-during-connect",
  "stop-during-query",
  "stop-during-read",
  "background",
  "webview-reload",
];
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
const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
function readReload(): ReloadMetadata | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const value = object(JSON.parse(raw));
    const iphone = object(value?.iphone);
    const pm5 = object(value?.pm5);
    if (
      !value ||
      !iphone ||
      !pm5 ||
      value.reloadPending !== true ||
      !SCENARIOS.includes(value.scenario as GateScenario) ||
      stageFor(value.scenario as GateScenario) === undefined ||
      !nonempty(value.priorAttemptId) ||
      (value.priorStage !== "connect" &&
        value.priorStage !== "query" &&
        value.priorStage !== "read") ||
      !nonempty(iphone.model) ||
      !nonempty(iphone.iosVersion) ||
      !nonempty(pm5.model) ||
      !nonempty(pm5.firmware) ||
      !nonempty(pm5.advertisedNameShown)
    )
      return null;
    return {
      scenario: value.scenario as GateScenario,
      reloadPending: true,
      priorAttemptId: value.priorAttemptId,
      priorStage: value.priorStage,
      iphone: { model: iphone.model, iosVersion: iphone.iosVersion },
      pm5: {
        model: pm5.model,
        firmware: pm5.firmware,
        advertisedNameShown: pm5.advertisedNameShown,
      },
    };
  } catch {
    return null;
  }
}
function newReceipt(metadata: Metadata): Omit<NfcGateReceiptV1, "verdict"> {
  return {
    schema: "ergomatic/nfc-gate-minus-one/v1",
    capturedAtUtc: new Date().toISOString(),
    iphone: metadata.iphone,
    pm5: metadata.pm5,
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

export default function GateMinusOneProbe() {
  const [initialReload] = useState(readReload);
  const [iphoneModel, setIphoneModel] = useState(
    initialReload?.iphone.model ?? "",
  );
  const [iosVersion, setIosVersion] = useState(
    initialReload?.iphone.iosVersion ?? "",
  );
  const [pm5Model, setPm5Model] = useState(initialReload?.pm5.model ?? "");
  const [pm5Firmware, setPm5Firmware] = useState(
    initialReload?.pm5.firmware ?? "",
  );
  const [advertisedName, setAdvertisedName] = useState(
    initialReload?.pm5.advertisedNameShown ?? "",
  );
  const [receipt, setReceipt] = useState<Omit<
    NfcGateReceiptV1,
    "verdict"
  > | null>(null);
  const receiptRef = useRef<Omit<NfcGateReceiptV1, "verdict"> | null>(null);
  const [status, setStatus] = useState(
    initialReload
      ? "Start B to release A's held continuation."
      : "Enter the device metadata to arm a sample.",
  );
  const [busy, setBusy] = useState(false);
  const [restart, setRestart] = useState(false);
  const [reloadReady, setReloadReady] = useState<ReloadMetadata | null>(null);
  const [exportedPartial, setExportedPartial] = useState(false);
  const [prior, setPrior] = useState(initialReload);
  const activeRef = useRef<Active | null>(null);
  const restartRef = useRef(false);
  const mounted = useRef(true);
  const owns = (active: Active) =>
    mounted.current && activeRef.current === active && !active.terminal;
  function publish() {
    const current = receiptRef.current;
    if (mounted.current && current)
      setReceipt({
        ...current,
        attempts: [...current.attempts],
        readerEndings: [...current.readerEndings],
        criteria: { ...current.criteria },
      });
  }
  function cleanupFailed(active: Active) {
    active.cleanupFailed = true;
    restartRef.current = true;
    if (mounted.current) setRestart(true);
  }
  // Track native primitives, not continuations which can themselves request
  // drain. Cancellation retains the radio lease until all primitives settle.
  async function pending<T>(
    active: Active,
    operation: () => Promise<T>,
  ): Promise<T> {
    const promise = operation();
    active.pending.add(promise);
    try {
      return await promise;
    } finally {
      active.pending.delete(promise);
    }
  }
  async function remove(active: Active, removers: GateRemoveListener[]) {
    const results = await Promise.allSettled(
      removers.splice(0).map((release) => pending(active, release)),
    );
    if (results.some((result) => result.status === "rejected"))
      cleanupFailed(active);
  }
  async function listen(
    active: Active,
    register: () => Promise<GateRemoveListener>,
    removers: GateRemoveListener[],
  ) {
    await pending(active, async () => {
      const release = await register();
      if (owns(active)) removers.push(release);
      else {
        try {
          await release();
        } catch {
          cleanupFailed(active);
        }
      }
    });
  }
  async function stopNfc(active: Active) {
    await gateNativePort.stopNfc(active.attemptId);
    active.nfcActive = false;
  }
  async function stopBle(active: Active) {
    await gateNativePort.stopBleScan();
    active.bleActive = false;
  }
  function drain(
    active: Active,
    message = "Sample cancelled and drained.",
  ): Promise<void> {
    if (active.drainPromise) return active.drainPromise;
    active.terminal = true;
    if (mounted.current) {
      setReloadReady(null);
      setExportedPartial(false);
    }
    active.drainPromise = Promise.resolve().then(async () => {
      const safe = async (operation: () => Promise<void>) => {
        try {
          await operation();
        } catch {
          cleanupFailed(active);
        }
      };
      // Stop immediately, then again if a pending start resolves after that stop.
      // A pending connect is disconnected only after its completion is known.
      if (active.nfcActive) await safe(() => stopNfc(active));
      if (active.bleActive) await safe(() => stopBle(active));
      while (active.pending.size > 0)
        await Promise.allSettled([...active.pending]);
      if (active.nfcActive) await safe(() => stopNfc(active));
      if (active.bleActive) await safe(() => stopBle(active));
      if (active.connectedDevice !== null) {
        const deviceId = active.connectedDevice;
        await safe(async () => {
          await gateNativePort.disconnectBle(deviceId);
          active.connectedDevice = null;
          active.entry.disconnected = true;
        });
      }
      await remove(active, active.nfcRemovers);
      await remove(active, active.otherRemovers);
      if (activeRef.current === active) activeRef.current = null;
      if (mounted.current) {
        setBusy(false);
        setStatus(active.cleanupFailed ? RESTART : message);
        publish();
      }
    });
    return active.drainPromise;
  }
  function stale(active: Active, id: string) {
    if (!owns(active) || id === active.attemptId) return false;
    active.entry.staleIdDroppedCount += 1;
    publish();
    return true;
  }
  async function completeScan(active: Active) {
    if (!owns(active) || active.finalizing) return;
    active.finalizing = true;
    try {
      await pending(active, () => stopBle(active));
      if (!owns(active)) return;
      if (active.matchingIds.size !== 1 || active.firstDeviceId === null) {
        await drain(
          active,
          "BLE collision observed; connection intentionally blocked.",
        );
        return;
      }
      const deviceId = active.firstDeviceId;
      // An uncertain/rejected connection is also disconnected during cleanup.
      active.connectedDevice = deviceId;
      await pending(active, () =>
        gateNativePort.connectBle(deviceId, () => undefined),
      );
      active.entry.connected = true;
      if (!owns(active)) return;
      await pending(active, async () => {
        await gateNativePort.disconnectBle(deviceId);
        active.connectedDevice = null;
        active.entry.disconnected = true;
      });
      if (!owns(active)) return;
      const current = receiptRef.current!;
      current.criteria.pickerFreeBleConnect = true;
      if (active.priorReleased) {
        current.criteria.nativeIdentityAndDrain = true;
        current.criteria.staleACannotAffectB = true;
      }
      publish();
      await drain(active, "BLE connect and disconnect observed.");
    } catch {
      // Any failed release makes reuse uncertain, even if a retry later works.
      cleanupFailed(active);
      await drain(active, "BLE scan/connect failed.");
    }
  }
  async function startBle(active: Active) {
    if (
      (await pending(active, () => gateNativePort.currentAppState())) !==
        "foreground" ||
      !owns(active)
    ) {
      await drain(active, "App is backgrounded; BLE was not armed.");
      return;
    }
    await pending(active, () => gateNativePort.initializeBle());
    if (!owns(active)) return;
    const enabled = await pending(active, () => gateNativePort.isBleEnabled());
    if (!owns(active)) return;
    if (!enabled) {
      await drain(active, "Bluetooth is disabled; no scan started.");
      return;
    }
    active.scanStartedAt = now();
    active.bleActive = true;
    await pending(active, async () => {
      await gateNativePort.startUnfilteredBleScan((value) => {
        if (!owns(active) || active.finalizing || active.payload === null)
          return;
        const result = object(value);
        const deviceId = object(result?.device)?.deviceId;
        const localName = result?.localName;
        if (
          !nonempty(deviceId) ||
          localName !== active.metadata.pm5.advertisedNameShown
        )
          return;
        const match = matchAdvertisedName(active.payload, localName);
        if (!match) return;
        active.matchingTimes.push(performance.now() - active.scanStartedAt);
        active.matchingIds.add(deviceId);
        active.matchingCounts.set(
          deviceId,
          (active.matchingCounts.get(deviceId) ?? 0) + 1,
        );
        active.firstDeviceId ??= deviceId;
        Object.assign(active.entry, {
          decodedName: match.decodedName,
          liveLocalName: localName,
          trailingPayloadBytes: match.trailingPayloadBytes,
          firstMatchingAdvertisementMs: active.matchingTimes[0]!,
          matchingAdvertisementIntervalsMs: active.matchingTimes
            .slice(1)
            .map((time, index) => time - active.matchingTimes[index]!),
          matchingDeviceCount: active.matchingIds.size,
        });
        receiptRef.current!.criteria.exactLocalNameBridge = true;
        publish();
        if (active.scanReady && (active.matchingCounts.get(deviceId) ?? 0) >= 2)
          void completeScan(active);
      });
      active.bleActive = true;
    });
    if (owns(active)) {
      active.scanReady = true;
      if ([...active.matchingCounts.values()].some((count) => count >= 2))
        void completeScan(active);
      else setStatus("Scanning for the PM5's exact local name.");
    }
  }
  async function handleNfc(active: Active, value: unknown) {
    if (!owns(active)) return;
    const id = object(value)?.attemptId;
    if (!nonempty(id) || stale(active, id) || active.reading) return;
    if (!active.nfcReady) {
      active.earlyNfcEvent ??= value;
      return;
    }
    active.reading = true;
    try {
      const decoded = decodeNfcEvent(value);
      active.entry.records = decoded.records;
      publish();
      await pending(active, () => stopNfc(active));
      if (!owns(active)) return;
      await remove(active, active.nfcRemovers);
      if (active.cleanupFailed) {
        await drain(active);
        return;
      }
      if (!owns(active)) return;
      const records = decoded.records.filter(exactType);
      if (records.length !== 1 || records[0]!.payload.length < 7) {
        await drain(
          active,
          "No complete unique PM5 NFC external-type record was observed.",
        );
        return;
      }
      active.payload = records[0]!.payload;
      receiptRef.current!.criteria.rawNdefShape = true;
      receiptRef.current!.criteria.exactType = true;
      publish();
      await startBle(active);
    } catch {
      await drain(active, "NFC read/setup failed; no BLE connection was made.");
    }
  }
  async function heldStage(active: Active, stage: GateNfcStage) {
    if (active.entry.scenario === "webview-reload") {
      if (!owns(active)) return;
      setStatus(
        "A remains native-live. Use the attached inspector to export, verify, then reload.",
      );
    } else {
      await drain(
        active,
        "A was stopped and drained. Export the partial receipt before reload.",
      );
    }
    if (!mounted.current || active.cleanupFailed) return;
    setReloadReady({
      scenario: active.entry.scenario,
      reloadPending: true,
      priorAttemptId: active.attemptId,
      priorStage: stage,
      iphone: active.metadata.iphone,
      pm5: active.metadata.pm5,
    });
  }
  async function runScenario(
    scenario: GateScenario,
    previous: ReloadMetadata | null = null,
    endingAction: ReaderEndingAction | null = null,
  ) {
    if (
      !mounted.current ||
      activeRef.current ||
      restartRef.current ||
      reloadReady
    )
      return;
    const metadata: Metadata = {
      iphone: { model: iphoneModel.trim(), iosVersion: iosVersion.trim() },
      pm5: {
        model: pm5Model.trim(),
        firmware: pm5Firmware.trim(),
        advertisedNameShown: advertisedName.trim(),
      },
    };
    if (
      ![
        ...Object.values(metadata.iphone),
        ...Object.values(metadata.pm5),
      ].every(nonempty)
    )
      return;
    const current = receiptRef.current ?? newReceipt(metadata);
    receiptRef.current = current;
    const entry: NfcGateReceiptV1["attempts"][number] = {
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
      staleAttemptSettlementCount: null,
    };
    current.attempts.push(entry);
    if (typeof crypto.randomUUID !== "function") {
      publish();
      setStatus(
        "Secure attempt IDs are unavailable; use an iOS 15.4+ diagnostic device.",
      );
      return;
    }
    const active: Active = {
      attemptId: crypto.randomUUID(),
      entry,
      metadata,
      pending: new Set(),
      nfcRemovers: [],
      otherRemovers: [],
      nfcActive: false,
      nfcReady: false,
      earlyNfcEvent: null,
      bleActive: false,
      scanReady: false,
      connectedDevice: null,
      terminal: false,
      drainPromise: null,
      cleanupFailed: false,
      reading: false,
      finalizing: false,
      holdStage: previous ? undefined : stageFor(scenario),
      priorReleased: false,
      payload: null,
      firstDeviceId: null,
      matchingIds: new Set(),
      matchingCounts: new Map(),
      matchingTimes: [],
      scanStartedAt: 0,
      selectedEnding: endingAction,
    };
    activeRef.current = active;
    setBusy(true);
    publish();
    const started = now();
    try {
      const supported = await pending(active, () =>
        gateNativePort.isNfcSupported(),
      );
      if (!owns(active)) return;
      entry.capabilityLatencyMs = now() - started;
      publish();
      if (!supported) {
        await drain(active, "NFC is not supported on this device.");
        return;
      }
      await listen(
        active,
        () =>
          gateNativePort.onAppState((state) => {
            if (state === "background" && activeRef.current === active)
              void drain(active, "App backgrounded; radio operations drained.");
          }),
        active.otherRemovers,
      );
      if (!owns(active)) return;
      await listen(
        active,
        () =>
          gateNativePort.onNfcEvent((event) => {
            void handleNfc(active, event);
          }),
        active.nfcRemovers,
      );
      if (!owns(active)) return;
      await listen(
        active,
        () =>
          gateNativePort.onNfcSessionEnd((value) => {
            if (!owns(active)) return;
            const event = object(value);
            if (!nonempty(event?.attemptId) || stale(active, event.attemptId))
              return;
            if (
              event.reason !== "userCancelled" &&
              event.reason !== "sessionTimeout" &&
              event.reason !== "invalidated"
            )
              return;
            // Native didInvalidate notifies before resolving stopScanning.
            // A record handoff already owns that stop; it is not an operator ending.
            if (active.reading) return;
            if (active.selectedEnding !== null) {
              current.readerEndings.push({
                action: active.selectedEnding,
                observedReason: event.reason as ReaderEndingReason,
              });
              // Selection plus a generic ending cannot prove the singleton
              // native producer. Only Task 3 controller assembly may certify
              // this criterion after all three actions and the native message.
              publish();
            }
            void drain(active, "NFC reader session ended.");
          }),
        active.nfcRemovers,
      );
      if (!owns(active)) return;
      if (stageFor(scenario) !== undefined) {
        await listen(
          active,
          () =>
            gateNativePort.onGateProgress((value) => {
              if (!owns(active)) return;
              const event = object(value);
              if (
                !nonempty(event?.attemptId) ||
                (event.stage !== "connect" &&
                  event.stage !== "query" &&
                  event.stage !== "read")
              )
                return;
              if (stale(active, event.attemptId)) return;
              if (event.stage === active.holdStage)
                void heldStage(active, event.stage);
            }),
          active.otherRemovers,
        );
        if (!owns(active)) return;
      }
      const state = await pending(active, () =>
        gateNativePort.currentAppState(),
      );
      if (!owns(active)) return;
      if (state !== "foreground") {
        await drain(active, "App is backgrounded; NFC was not armed.");
        return;
      }
      active.nfcActive = true;
      await pending(active, async () => {
        await gateNativePort.startNfc({
          attemptId: active.attemptId,
          alertMessage: "Hold your iPhone near the PM5.",
          ...(active.holdStage === undefined
            ? {}
            : { gateMinusOneHoldStage: active.holdStage }),
        });
        active.nfcActive = true;
      });
      if (!owns(active)) return;
      active.nfcReady = true;
      if (previous) {
        await pending(active, () =>
          gateNativePort.releaseGateProgress(
            previous.priorAttemptId,
            previous.priorStage,
          ),
        );
        if (!owns(active)) return;
        active.priorReleased = true;
        setPrior(null);
      }
      setStatus("Hold your iPhone near the PM5.");
      if (active.earlyNfcEvent !== null) {
        const event = active.earlyNfcEvent;
        active.earlyNfcEvent = null;
        await handleNfc(active, event);
      }
    } catch {
      await drain(
        active,
        "NFC setup failed; next sample is available after cleanup.",
      );
    }
  }
  function exportReceipt(partial = false) {
    if (!receiptRef.current) return;
    try {
      const json = emitGateReceipt(receiptRef.current);
      if (partial) {
        setExportedPartial(true);
        setStatus(
          "Controller: verify the complete console export before asking for Reload WebView.",
        );
      } else {
        void navigator.clipboard
          .writeText(json)
          .catch(() =>
            setStatus(
              "Clipboard unavailable; collect the framed console export.",
            ),
          );
      }
    } catch {
      setStatus(
        "Receipt validation failed; raw or malformed evidence was not exported.",
      );
    }
  }
  async function reloadWebView() {
    const active = activeRef.current;
    if (
      !reloadReady ||
      !exportedPartial ||
      (active &&
        (active.terminal || active.entry.scenario !== "webview-reload")) ||
      restartRef.current
    )
      return;
    if (active) {
      // This leg transfers a LIVE native session across documents. Retire only
      // old-document callbacks; the native coordinator drains A when B starts.
      active.terminal = true;
      while (active.pending.size > 0)
        await Promise.allSettled([...active.pending]);
      await remove(active, active.nfcRemovers);
      await remove(active, active.otherRemovers);
      if (!mounted.current || active.cleanupFailed || active.drainPromise) {
        await drain(active);
        return;
      }
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(reloadReady));
      if (active) activeRef.current = null;
      location.reload();
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      if (active) {
        activeRef.current = active;
        await drain(active, "Reload failed; A was stopped and drained.");
      } else setStatus("Reload metadata could not be saved; do not reload.");
    }
  }
  useEffect(() => {
    mounted.current = true;
    sessionStorage.removeItem(STORAGE_KEY);
    return () => {
      mounted.current = false;
      const active = activeRef.current;
      if (active) void drain(active);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- document-owned native lease
  const complete = Boolean(
    iphoneModel.trim() &&
    iosVersion.trim() &&
    pm5Model.trim() &&
    pm5Firmware.trim() &&
    advertisedName.trim(),
  );
  const latest = receipt?.attempts[receipt.attempts.length - 1];
  return (
    <section data-nfc-gate-minus-one="NFC Gate -1 disposable device probe">
      <h2 className="section-heading">NFC GATE -1 PROBE</h2>
      <label>
        iPhone model
        <input
          disabled={receipt !== null}
          value={iphoneModel}
          onChange={(event) => setIphoneModel(event.target.value)}
        />
      </label>
      <label>
        iOS version
        <input
          disabled={receipt !== null}
          value={iosVersion}
          onChange={(event) => setIosVersion(event.target.value)}
        />
      </label>
      <label>
        PM5 model
        <input
          disabled={receipt !== null}
          value={pm5Model}
          onChange={(event) => setPm5Model(event.target.value)}
        />
      </label>
      <label>
        PM5 firmware
        <input
          disabled={receipt !== null}
          value={pm5Firmware}
          onChange={(event) => setPm5Firmware(event.target.value)}
        />
      </label>
      <label>
        PM5 advertised name
        <input
          disabled={receipt !== null}
          value={advertisedName}
          onChange={(event) => setAdvertisedName(event.target.value)}
        />
      </label>
      <div>
        {SCENARIOS.map((scenario) => (
          <button
            type="button"
            key={scenario}
            disabled={
              !complete ||
              busy ||
              restart ||
              reloadReady !== null ||
              prior !== null
            }
            onClick={() => void runScenario(scenario)}
          >
            {scenario === "normal"
              ? "Run normal sample"
              : "Run " + scenario + " sample"}
          </button>
        ))}
      </div>
      {prior && (
        <button
          id="nfc-gate-start-b"
          type="button"
          disabled={busy || restart}
          onClick={() => void runScenario(prior.scenario, prior)}
        >
          Start B
        </button>
      )}
      <button
        type="button"
        disabled={!busy || restart}
        onClick={() => {
          if (activeRef.current) void drain(activeRef.current);
        }}
      >
        Cancel sample
      </button>
      <button
        type="button"
        disabled={
          !complete || busy || restart || reloadReady !== null || prior !== null
        }
        onClick={() => void runScenario("normal", null, "sheet-cancel")}
      >
        Sheet cancel
      </button>
      <button
        type="button"
        disabled={
          !complete || busy || restart || reloadReady !== null || prior !== null
        }
        onClick={() => void runScenario("normal", null, "no-tag-timeout")}
      >
        No-tag timeout
      </button>
      <button
        type="button"
        disabled={
          !complete || busy || restart || reloadReady !== null || prior !== null
        }
        onClick={() => void runScenario("normal", null, "forced-invalidation")}
      >
        Forced invalidation
      </button>
      {reloadReady && (
        <>
          <button
            id="nfc-gate-export"
            type="button"
            onClick={() => exportReceipt(true)}
          >
            Export partial receipt
          </button>
          <button
            id="nfc-gate-reload"
            type="button"
            disabled={!exportedPartial || restart}
            onClick={() => void reloadWebView()}
          >
            Reload WebView
          </button>
        </>
      )}
      <p>{status}</p>
      <p>{"Matching device count: " + (latest?.matchingDeviceCount ?? 0)}</p>
      {latest && (
        <>
          <p>{"Raw NFC records: " + JSON.stringify(latest.records)}</p>
          <button type="button" onClick={() => exportReceipt()}>
            Copy redacted receipt
          </button>
        </>
      )}
    </section>
  );
}
