import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  ConnectionAttemptId,
  MonitorDiscoveryRequest,
} from "../../domain/monitor/types.js";
import { registerAppLifecycleListener } from "../adapters/appLifecycle";
import { successHaptic } from "../adapters/haptics";
import {
  resolveNfcReader,
  type NfcCapability,
  type NfcReader,
} from "../adapters/nfcReader";
import type { ConnectionEntryIntent } from "./ConnectAction";
import { discardStagedRetire } from "./handoffStore";
import { claimMountLease, onMountLeaseLost } from "./mountLease";
import {
  createConnectionAttemptTrace,
  latestConnectionAttemptTrace,
  type ConnectionAttemptTrace,
  type ConnectionAttemptTraceKind,
} from "./nfc/connectionAttemptTrace";
import {
  cacheNfcCapability,
  readCachedNfcCapability,
} from "./nfc/nfcCapabilityCache";
import { paintBarrier } from "./nfc/paintBarrier";
import { runNfcAttempt, type NfcInlineCopy } from "./nfc/runNfcAttempt";
import type { MonitorSession } from "./useMonitorSession";

export type NfcCapabilityState = "unknown" | NfcCapability;
export const NFC_CAPABILITY_DEADLINE_MS = 2_000;

export function useNfcCapability(reader: NfcReader): NfcCapabilityState {
  const [capability, setCapability] = useState<NfcCapabilityState>(
    () => readCachedNfcCapability() ?? "unknown",
  );
  useEffect(() => {
    if (readCachedNfcCapability() !== null) return;
    let cancelled = false;
    const trace = createConnectionAttemptTrace();
    const publish = (): void => {
      if (latestConnectionAttemptTrace() === null) trace.complete();
    };
    const timer = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      trace.record("capability-timed-out");
      publish();
    }, NFC_CAPABILITY_DEADLINE_MS);
    reader.capability().then(
      (result) => {
        if (cancelled) return;
        cancelled = true;
        clearTimeout(timer);
        cacheNfcCapability(result);
        trace.record(result);
        publish();
        setCapability(result);
      },
      () => {
        if (cancelled) return;
        cancelled = true;
        clearTimeout(timer);
        trace.record("capability-failed");
        publish();
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reader]);
  return capability;
}

export interface ConnectionEntryOffer {
  claim(): ConnectionEntryAttempt;
}

const connectionEntryAttemptBrand: unique symbol = Symbol(
  "connection-entry-attempt",
);

export interface ConnectionEntryAttempt {
  readonly [connectionEntryAttemptBrand]: true;
  readonly targetName: string | null;
  connect(session: Pick<MonitorSession, "connect" | "cancel">): Promise<void>;
  cancel(session: Pick<MonitorSession, "connect" | "cancel">): Promise<void>;
}

export interface ConnectionEntry {
  capability: NfcCapabilityState;
  busy: boolean;
  accepted: boolean;
  begin(
    intent: ConnectionEntryIntent,
    sinks: {
      onReady(offer: ConnectionEntryOffer): void;
      onInlineError(copy: NfcInlineCopy): void;
    },
  ): void;
}

type EntrySession = Pick<MonitorSession, "connect" | "cancel">;

interface BoundSession {
  connect: MonitorSession["connect"];
  cancel: MonitorSession["cancel"];
}

interface OwnedTrace {
  readonly view: ConnectionAttemptTrace;
  publishIfDirty(): void;
}

type AttemptStatus = "resolving" | "claimed" | "draining" | "abandoned";

interface Operation {
  readonly attemptId: ConnectionAttemptId;
  request: MonitorDiscoveryRequest | null;
  readonly trace?: OwnedTrace;
  readonly work: Set<Promise<void>>;
  status: AttemptStatus;
  wasClaimed: boolean;
  transferOpen: boolean;
  boundSession: BoundSession | null;
  connectPromise: Promise<void> | null;
  cancelPromise: Promise<void> | null;
  controller: AbortController | null;
  attempt: ConnectionEntryAttempt | null;
}

interface AttemptPrivate {
  readonly operation: Operation;
  abandon(): void;
}

const attemptPrivate = new WeakMap<ConnectionEntryAttempt, AttemptPrivate>();
const publicationClock = { next: 0, lastPublished: 0 };

function createOwnedTrace(publicationOrder: number): OwnedTrace {
  const delegate = createConnectionAttemptTrace();
  let recordGeneration = 0;
  let publishedGeneration = 0;
  const view: ConnectionAttemptTrace = {
    record(kind: ConnectionAttemptTraceKind, detail?: string) {
      delegate.record(kind, detail);
      recordGeneration += 1;
    },
    entries() {
      return delegate.entries();
    },
    complete() {
      if (publicationOrder < publicationClock.lastPublished) return;
      delegate.complete();
      publicationClock.lastPublished = publicationOrder;
      publishedGeneration = recordGeneration;
    },
  };
  return {
    view,
    publishIfDirty() {
      if (recordGeneration !== publishedGeneration) view.complete();
    },
  };
}

function bindSession(
  operation: Operation,
  session: EntrySession,
): BoundSession {
  if (operation.boundSession === null) {
    operation.boundSession = {
      connect: session.connect.bind(session),
      cancel: session.cancel.bind(session),
    };
  }
  return operation.boundSession;
}

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

export function useConnectionEntry(): ConnectionEntry {
  const [reader] = useState<NfcReader>(() => resolveNfcReader());
  const capability = useNfcCapability(reader);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const currentRef = useRef<Operation | null>(null);
  const mountedRef = useRef(true);

  function clearCurrent(operation: Operation): void {
    if (currentRef.current !== operation) return;
    currentRef.current = null;
    if (mountedRef.current) {
      setAccepted(false);
      setBusy(false);
    }
  }

  function publishAfterOwnedWork(operation: Operation): void {
    const captured = [...operation.work];
    void Promise.allSettled(captured).then(() => {
      operation.trace?.publishIfDirty();
    });
  }

  function abandon(operation: Operation): void {
    if (operation.status === "abandoned" || operation.status === "draining") {
      return;
    }
    operation.status = "abandoned";
    operation.controller?.abort();
    discardStagedRetire(operation.attemptId);
    clearCurrent(operation);
    if (operation.wasClaimed) publishAfterOwnedWork(operation);
  }

  function connect(operation: Operation, session: EntrySession): Promise<void> {
    if (operation.status === "abandoned" || operation.status === "draining") {
      return Promise.resolve();
    }
    if (operation.connectPromise !== null) return operation.connectPromise;
    const bound = bindSession(operation, session);
    let promise: Promise<void>;
    try {
      if (operation.request === null) return Promise.resolve();
      promise = bound.connect(operation.request, operation.trace?.view);
    } catch (error: unknown) {
      promise = Promise.reject(asError(error));
    }
    operation.connectPromise = promise;
    operation.work.add(promise);
    const settled = (): void => {
      if (operation.connectPromise === promise) operation.connectPromise = null;
      operation.work.delete(promise);
    };
    void promise.then(settled, settled);
    return promise;
  }

  function cancel(operation: Operation, session: EntrySession): Promise<void> {
    if (operation.cancelPromise !== null) return operation.cancelPromise;
    if (operation.status === "abandoned") return Promise.resolve();
    const bound = bindSession(operation, session);
    operation.status = "draining";
    if (currentRef.current === operation && mountedRef.current) setBusy(true);
    let promise: Promise<void>;
    try {
      promise = bound.cancel();
    } catch (error: unknown) {
      promise = Promise.reject(asError(error));
    }
    discardStagedRetire(operation.attemptId);
    operation.cancelPromise = promise;
    operation.work.add(promise);
    const cleanupWork = [...operation.work];
    const settled = (): void => {
      if (operation.status !== "draining") return;
      operation.status = "abandoned";
      operation.work.delete(promise);
      clearCurrent(operation);
      void Promise.allSettled(cleanupWork).then(() => {
        operation.trace?.publishIfDirty();
      });
    };
    void promise.then(settled, settled);
    return promise;
  }

  function createOperation(
    intent: ConnectionEntryIntent,
    trace?: OwnedTrace,
  ): Operation {
    return {
      attemptId: intent.attemptId,
      request: null,
      trace,
      work: new Set<Promise<void>>(),
      status: "resolving",
      wasClaimed: false,
      transferOpen: false,
      boundSession: null,
      connectPromise: null,
      cancelPromise: null,
      controller: null,
      attempt: null,
    };
  }

  function prepareAttempt(
    operation: Operation,
    targetName: string | null,
  ): ConnectionEntryAttempt {
    if (operation.attempt !== null) return operation.attempt;
    operation.request =
      targetName === null
        ? { kind: "picker", attemptId: operation.attemptId }
        : {
            kind: "advertised-name",
            attemptId: operation.attemptId,
            exactName: targetName,
          };
    const attempt: ConnectionEntryAttempt = {
      [connectionEntryAttemptBrand]: true,
      targetName,
      connect: (session) => connect(operation, session),
      cancel: (session) => cancel(operation, session),
    };
    operation.attempt = attempt;
    attemptPrivate.set(attempt, {
      operation,
      abandon: () => abandon(operation),
    });
    return attempt;
  }

  function offer(
    operation: Operation,
    onReady: (offer: ConnectionEntryOffer) => void,
  ): boolean {
    const offered: ConnectionEntryOffer = {
      claim() {
        if (operation.transferOpen && operation.status === "resolving") {
          operation.wasClaimed = true;
          operation.status = "claimed";
        }
        if (operation.attempt === null) {
          throw new Error("connection-entry offer has no attempt");
        }
        return operation.attempt;
      },
    };
    let returned = false;
    operation.transferOpen = true;
    try {
      onReady(offered);
      returned = true;
    } finally {
      operation.transferOpen = false;
      if (!returned || !operation.wasClaimed) abandon(operation);
    }
    if (operation.status === "claimed" && currentRef.current === operation) {
      if (mountedRef.current) {
        setAccepted(false);
        setBusy(false);
      }
      return true;
    }
    return false;
  }

  function finishBeforeClaim(operation: Operation): void {
    operation.trace?.view.complete();
    discardStagedRetire(operation.attemptId);
    if (operation.status !== "abandoned") operation.status = "abandoned";
    clearCurrent(operation);
  }

  async function runNfc(
    intent: ConnectionEntryIntent,
    operation: Operation,
    sinks: {
      onReady(ready: ConnectionEntryOffer): void;
      onInlineError(copy: NfcInlineCopy): void;
    },
  ): Promise<void> {
    const controller = new AbortController();
    operation.controller = controller;
    let unsubscribe: (() => void) | null = null;
    let handedOff = false;
    try {
      try {
        unsubscribe = await registerAppLifecycleListener((event) => {
          if (event === "background") {
            operation.trace!.view.record("foreground-abort");
            controller.abort();
          }
        });
      } catch {
        operation.trace!.view.record(
          "listener-registration-failed",
          "entry lifecycle",
        );
        throw new Error("lifecycle listener registration failed");
      }
      const outcome = await runNfcAttempt({
        attemptId: intent.attemptId,
        reader,
        trace: operation.trace!.view,
        signal: controller.signal,
        haptic: successHaptic,
        paint: (signal) => paintBarrier(signal),
        onAccepted: () => {
          if (
            mountedRef.current &&
            currentRef.current === operation &&
            operation.status === "resolving"
          ) {
            flushSync(() => setAccepted(true));
          }
        },
      });
      if (!mountedRef.current || currentRef.current !== operation) return;
      if (outcome.kind === "target") {
        prepareAttempt(operation, outcome.target.advertisingName);
        handedOff = offer(operation, sinks.onReady);
      } else if (outcome.kind === "inline-error") {
        sinks.onInlineError(outcome.copy);
      }
    } catch {
      if (
        mountedRef.current &&
        (currentRef.current === operation ||
          operation.wasClaimed ||
          operation.attempt !== null)
      ) {
        sinks.onInlineError("NFC scan stopped. Try again.");
      }
    } finally {
      unsubscribe?.();
      if (operation.controller === controller) operation.controller = null;
      if (!handedOff && !operation.wasClaimed) finishBeforeClaim(operation);
      if (handedOff && currentRef.current === operation && mountedRef.current) {
        setAccepted(false);
        setBusy(false);
      }
    }
  }

  function begin(
    intent: ConnectionEntryIntent,
    sinks: {
      onReady(ready: ConnectionEntryOffer): void;
      onInlineError(copy: NfcInlineCopy): void;
    },
  ): void {
    if (currentRef.current !== null) {
      discardStagedRetire(intent.attemptId);
      return;
    }
    const publicationOrder = ++publicationClock.next;
    const trace =
      intent.kind === "nfc" ? createOwnedTrace(publicationOrder) : undefined;
    const operation = createOperation(intent, trace);
    currentRef.current = operation;
    if (mountedRef.current) setBusy(true);
    if (intent.kind === "manual") {
      prepareAttempt(operation, null);
      offer(operation, sinks.onReady);
      return;
    }
    void runNfc(intent, operation, sinks);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const current = currentRef.current;
      current?.controller?.abort();
      if (current?.status === "claimed") {
        current.status = "abandoned";
        discardStagedRetire(current.attemptId);
        if (currentRef.current === current) currentRef.current = null;
        const captured = [...current.work];
        void Promise.allSettled(captured).then(() => {
          current.trace?.publishIfDirty();
        });
      }
    };
  }, []);

  return { capability, busy, accepted, begin };
}

export function useConnectionEntryLifetime(
  attempt: ConnectionEntryAttempt | null,
): void {
  const privateState = attempt === null ? null : attemptPrivate.get(attempt);
  if (attempt !== null && privateState === undefined) {
    throw new Error("connection-entry attempt was not created by this owner");
  }
  useEffect(() => {
    if (privateState === null || privateState === undefined) return;
    const { operation } = privateState;
    onMountLeaseLost(operation.attemptId, privateState.abandon);
    const lease = claimMountLease(operation.attemptId);
    return () => lease.release();
  }, [privateState]);
}
