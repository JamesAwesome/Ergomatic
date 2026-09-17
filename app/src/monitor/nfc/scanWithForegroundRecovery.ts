import type { DiscoveredMonitor } from "../../../domain/monitor/types.js";
import type {
  AppLifecycleCallback,
  AppLifecycleUnsubscribe,
} from "../../adapters/appLifecycle";
import type { ConnectionAttemptTrace } from "./connectionAttemptTrace";

/** One explicit connection owns this operation. A backgrounded pass may be
 * replaced once, only after its transport confirms both abort and cleanup.
 * The containing signal cancels scans AND waits. No state survives return. */
export async function scanWithForegroundRecovery(deps: {
  signal: AbortSignal;
  cancelSource: () => "cancel" | "teardown";
  register: (
    cb: AppLifecycleCallback,
  ) => AppLifecycleUnsubscribe | Promise<AppLifecycleUnsubscribe>;
  scan: (
    signal: AbortSignal,
    trace?: ConnectionAttemptTrace,
  ) => Promise<DiscoveredMonitor[]>;
  trace?: ConnectionAttemptTrace;
  finished: (
    trace: ConnectionAttemptTrace | undefined,
    error?: { value: unknown },
  ) => void;
}): Promise<DiscoveredMonitor[]> {
  let foreground = true;
  let closed = false;
  let scanned = false;
  let pass = new AbortController();
  let backgroundAborted = false;
  let trace = deps.trace;
  let wake: (() => void) | undefined;
  let unsubscribe: AppLifecycleUnsubscribe | undefined;
  const abortPass = (source: "background" | "cancel" | "teardown") => {
    if (pass.signal.aborted) return;
    backgroundAborted = source === "background";
    trace?.record("ble-scan-abort-requested", source);
    pass.abort();
  };
  const cancel = () => {
    abortPass(deps.cancelSource());
    wake?.();
  };
  const checkCancelled = () => {
    if (!deps.signal.aborted) return;
    throw Object.assign(new Error("The targeted scan was aborted."), {
      name: "TargetScanInterruptedError",
    });
  };
  const waitForForeground = async () => {
    if (!foreground) trace?.record("ble-scan-resume-waiting");
    while (!foreground && !deps.signal.aborted) {
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = undefined;
    }
    checkCancelled();
  };
  deps.signal.addEventListener("abort", cancel, { once: true });
  trace?.record("ble-scan-requested");
  try {
    try {
      unsubscribe = await deps.register((event) => {
        if (closed || deps.signal.aborted) return;
        trace?.record("ble-scan-lifecycle", event);
        foreground = event === "foreground";
        if (foreground) wake?.();
        else abortPass("background");
      });
    } catch (error: unknown) {
      trace?.record("listener-registration-failed", "scan lifecycle");
      throw error;
    }
    checkCancelled();
    for (let index = 0; ; index += 1) {
      let found: DiscoveredMonitor[];
      try {
        scanned = true;
        found = await deps.scan(pass.signal, trace);
      } catch (error: unknown) {
        deps.finished(trace, { value: error });
        checkCancelled();
        // Abort attribution comes from the winning transport result, never
        // from timing, error text, or the optional diagnostic ring. The exact
        // signal avoids requiring the newer AbortSignal.reason API.
        if (
          index !== 0 ||
          !backgroundAborted ||
          !(error instanceof Error) ||
          error.name !== "TargetScanInterruptedError" ||
          !("interruptedSignal" in error) ||
          error.interruptedSignal !== pass.signal
        )
          throw error;
        await waitForForeground();
        trace =
          deps.trace === undefined
            ? undefined
            : {
                ...deps.trace,
                record: (kind, detail) =>
                  deps.trace?.record(
                    kind,
                    `pass=2${detail === undefined ? "" : ` ${detail}`}`,
                  ),
              };
        trace?.record("ble-scan-resumed");
        pass = new AbortController();
        backgroundAborted = false;
        trace?.record("ble-scan-requested");
        continue;
      }
      deps.finished(trace);
      // A match can win before backgrounding while cleanup is still pending.
      // Keep that result, but do not start GATT while the app is hidden.
      await waitForForeground();
      return found;
    }
  } catch (error: unknown) {
    // A registration failure or cancellation before scanning still closes
    // the requested diagnostic span. Individual scan passes close above.
    if (!scanned) deps.finished(trace, { value: error });
    throw error;
  } finally {
    closed = true;
    wake = undefined;
    deps.signal.removeEventListener("abort", cancel);
    unsubscribe?.();
  }
}
