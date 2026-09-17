import { isValidPm5AdvertisingName } from "../../domain/monitor/nfc.js";
import {
  hasTargetedScan,
  isValidAttemptId,
  type DiscoveredMonitor,
  type TargetedMonitorDiscoveryRequest,
  type Transport,
} from "../../domain/monitor/types.js";
import type {
  AppLifecycleCallback,
  AppLifecycleUnsubscribe,
} from "../adapters/appLifecycle";
import type { ConnectionAttemptTrace } from "./nfc/connectionAttemptTrace";
import { mapTargetedFailure, type ConnectedError } from "./connectionFailure";

export type TargetedDiscoveryCancelSource = "cancel" | "teardown";

export type TargetedDiscoveryResult =
  | { kind: "found"; monitors: DiscoveredMonitor[] }
  | { kind: "failed"; error: ConnectedError };

export interface TargetedDiscoveryInput {
  transport: Transport;
  request: TargetedMonitorDiscoveryRequest;
  trace?: ConnectionAttemptTrace;
  attempt: {
    ordinal: number;
    isSuperseded(): boolean;
  };
  registerLifecycle(
    callback: AppLifecycleCallback,
  ): AppLifecycleUnsubscribe | Promise<AppLifecycleUnsubscribe>;
}

export interface TargetedDiscoveryOwner {
  discover(input: TargetedDiscoveryInput): Promise<TargetedDiscoveryResult>;
  cancel(source: TargetedDiscoveryCancelSource): void;
}

interface ActiveOperation {
  controller: AbortController;
  cancelSource: TargetedDiscoveryCancelSource;
}

function transportMissing(): ConnectedError {
  return {
    reason: "transport-missing",
    detail: "This device has no Bluetooth transport.",
  };
}

function interrupted(): Error {
  return Object.assign(new Error("The targeted scan was aborted."), {
    name: "TargetScanInterruptedError",
  });
}

export function createTargetedDiscoveryOwner(): TargetedDiscoveryOwner {
  let current: ActiveOperation | null = null;

  async function discover(
    input: TargetedDiscoveryInput,
  ): Promise<TargetedDiscoveryResult> {
    const { request, transport } = input;
    if (
      !isValidAttemptId(request.attemptId) ||
      !isValidPm5AdvertisingName(request.exactName) ||
      !hasTargetedScan(transport)
    ) {
      return { kind: "failed", error: transportMissing() };
    }

    const ordinal = input.attempt.ordinal;
    const operation: ActiveOperation = {
      controller: new AbortController(),
      cancelSource: "cancel",
    };
    current = operation;
    const scopedTrace: ConnectionAttemptTrace | undefined =
      input.trace === undefined
        ? undefined
        : {
            ...input.trace,
            record: (kind, detail) =>
              input.trace?.record(
                kind,
                `connect=${ordinal}${detail === undefined ? "" : ` ${detail}`}`,
              ),
          };

    let foreground = true;
    let closed = false;
    let scanned = false;
    let pass = new AbortController();
    let backgroundAborted = false;
    let passTrace = scopedTrace;
    let wake: (() => void) | undefined;
    let unsubscribe: AppLifecycleUnsubscribe | undefined;
    const abortPass = (
      source: "background" | TargetedDiscoveryCancelSource,
    ): void => {
      if (pass.signal.aborted) return;
      backgroundAborted = source === "background";
      passTrace?.record("ble-scan-abort-requested", source);
      pass.abort();
    };
    const cancel = (): void => {
      abortPass(operation.cancelSource);
      wake?.();
    };
    const checkCancelled = (): void => {
      if (operation.controller.signal.aborted) throw interrupted();
    };
    const waitForForeground = async (): Promise<void> => {
      if (!foreground) passTrace?.record("ble-scan-resume-waiting");
      while (!foreground && !operation.controller.signal.aborted) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
      checkCancelled();
    };
    const finished = (error?: unknown): void => {
      passTrace?.record(
        "ble-scan-finished",
        `outcome=${error === undefined ? "matched" : (mapTargetedFailure(error, request.exactName).reason ?? "link-failed")} superseded=${input.attempt.isSuperseded()}`,
      );
    };

    operation.controller.signal.addEventListener("abort", cancel, {
      once: true,
    });
    passTrace?.record("ble-scan-requested");
    try {
      try {
        try {
          unsubscribe = await input.registerLifecycle((event) => {
            if (closed || operation.controller.signal.aborted) return;
            passTrace?.record("ble-scan-lifecycle", event);
            foreground = event === "foreground";
            if (foreground) wake?.();
            else abortPass("background");
          });
        } catch (error: unknown) {
          passTrace?.record("listener-registration-failed", "scan lifecycle");
          throw error;
        }
        checkCancelled();
        for (let index = 0; ; index += 1) {
          let found: DiscoveredMonitor[];
          try {
            scanned = true;
            found = await transport.scanTarget(request, pass.signal, passTrace);
          } catch (error: unknown) {
            finished(error);
            checkCancelled();
            if (
              index !== 0 ||
              !backgroundAborted ||
              !(error instanceof Error) ||
              error.name !== "TargetScanInterruptedError" ||
              !("interruptedSignal" in error) ||
              error.interruptedSignal !== pass.signal
            ) {
              throw error;
            }
            // Recovery follows transport acknowledgement, not lifecycle timing
            // or error prose. The exact signal identifies the pass whose native
            // cleanup has settled without relying on AbortSignal.reason.
            await waitForForeground();
            passTrace =
              scopedTrace === undefined
                ? undefined
                : {
                    ...scopedTrace,
                    record: (kind, detail) =>
                      scopedTrace.record(
                        kind,
                        `pass=2${detail === undefined ? "" : ` ${detail}`}`,
                      ),
                  };
            passTrace?.record("ble-scan-resumed");
            pass = new AbortController();
            backgroundAborted = false;
            passTrace?.record("ble-scan-requested");
            continue;
          }
          finished();
          // A match may win before an observed background event while native
          // cleanup is still settling. Retain it, but wait for a matching
          // observed foreground event before handing it back to the GATT path.
          await waitForForeground();
          return { kind: "found", monitors: found };
        }
      } catch (error: unknown) {
        if (!scanned) finished(error);
        throw error;
      } finally {
        closed = true;
        wake = undefined;
        operation.controller.signal.removeEventListener("abort", cancel);
        unsubscribe?.();
      }
    } catch (error: unknown) {
      input.trace?.complete();
      return {
        kind: "failed",
        error: mapTargetedFailure(error, request.exactName),
      };
    } finally {
      if (current === operation) current = null;
    }
  }

  return {
    discover,
    cancel(source) {
      const operation = current;
      if (operation === null || operation.controller.signal.aborted) return;
      operation.cancelSource = source;
      operation.controller.abort();
    },
  };
}
