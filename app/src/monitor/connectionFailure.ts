import type { ProgramRejectionReason } from "./driver";

export interface ConnectedError {
  reason:
    | ProgramRejectionReason
    | "busy"
    | "bluetooth-off"
    | "link-failed"
    | "transport-missing"
    | "scan-dismissed"
    | "permission-denied"
    // Targeted discovery lookup/cleanup failures, never machine refusals.
    // Each carries its approved copy below and none inherits the generic
    // "End whatever is showing…" sentence.
    | "target-not-advertising"
    | "target-already-connected"
    | "target-ambiguous"
    | "target-interrupted"
    | "scan-cleanup-failed"
    // The monitor decoded successfully and told us it is attached to a
    // machine this app does not record. This is our refusal, not the PM5's.
    | "unsupported-machine";
  detail: string;
  raw?: string;
}

const TARGETED_FAILURE_COPY: Readonly<
  Record<string, { reason: ConnectedError["reason"]; detail: string }>
> = {
  TargetAlreadyConnectedError: {
    reason: "target-already-connected",
    detail: "End the monitor's current connection, then try again.",
  },
  TargetMonitorAmbiguousError: {
    reason: "target-ambiguous",
    detail: "More than one PM5 has this name. Use Connect.",
  },
  TargetScanInterruptedError: {
    reason: "target-interrupted",
    detail: "Connection interrupted. Try again.",
  },
  ScanCleanupFailedError: {
    reason: "scan-cleanup-failed",
    detail: "Bluetooth cleanup failed. Restart Ergomatic before trying again.",
  },
  // Product callers mint the attempt ID and parse the advertised name, so
  // this is unreachable there. Keep a stopped, fail-closed result for direct
  // or future callers instead of inventing a transport claim.
  TargetedRequestInvalidError: {
    reason: "target-interrupted",
    detail: "Connection interrupted. Try again.",
  },
};

/** A `scan()`/`connect()` failure, sorted into the things it can actually be.
 * The Capacitor transport pre-translates its failures to names before they
 * reach this function, so only web-transport prose reaches the regexes. A
 * dismissed picker is ordinary: both adapters surface it as a
 * `NotFoundError`-shaped rejection. Chrome also uses that name when the
 * adapter is unavailable, so the message separates those cases.
 *
 * Everything else is `link-failed`, not `bluetooth-off`: a `connect()` that
 * throws after the rower picked a device is a failure of that link.
 * `bluetooth-off` is reserved for the unavailable branch where turning it on
 * is the real remedy. */
export function mapRadioFailure(err: unknown): ConnectedError {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  // A poisoned native operation tail also rejects later manual discovery.
  // Preserve the restart-required remedy instead of offering a live retry.
  if (name === "ScanCleanupFailedError") {
    return { ...TARGETED_FAILURE_COPY.ScanCleanupFailedError!, raw: message };
  }
  // These native error-name checks precede prose matching intentionally. A
  // permission error's message may mention an unavailable adapter; the stable
  // name set by the Capacitor transport must win.
  if (name === "BluetoothPermissionError") {
    return {
      reason: "permission-denied",
      detail:
        "Ergomatic can't reach your monitor without Bluetooth. Allow Bluetooth for Ergomatic in Settings, then come back and try again.",
      raw: message,
    };
  }
  if (name === "ScanTimeoutError") {
    return {
      reason: "scan-dismissed",
      detail: "The search took too long. Try again.",
      raw: message,
    };
  }
  // Only the unavailable branch warrants Bluetooth-off advice. A failure
  // after a working picker is a failure of that selected link.
  const unavailable =
    /adapter|not enabled|not available|unavailable|disabled|powered off|turned off/i.test(
      message,
    );
  if (unavailable) {
    return {
      reason: "bluetooth-off",
      detail: "Bluetooth isn't available.",
      raw: message,
    };
  }
  if (name === "NotFoundError" || /cancel/i.test(message)) {
    return {
      reason: "scan-dismissed",
      detail: "No monitor was picked.",
      raw: message,
    };
  }
  return {
    reason: "link-failed",
    detail: "The link to the monitor failed.",
    raw: message,
  };
}

/** Kept private so tests pin the approved output independently rather than
 * importing the literal they are meant to protect. */
function notAdvertisingDetail(exactName: string): string {
  return `Couldn't reach ${exactName}.\nCheck nothing else is connected to it, then try again.`;
}

/** Targeted transports, fakes and replay communicate their stable failure
 * vocabulary by error name. Unknown failures retain the broad radio
 * classifier and its ordering. */
export function mapTargetedFailure(
  err: unknown,
  exactName: string,
): ConnectedError {
  const name = err instanceof Error ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err);
  if (name === "TargetMonitorNotAdvertisingError") {
    return {
      reason: "target-not-advertising",
      detail: notAdvertisingDetail(exactName),
      raw,
    };
  }
  const hit = TARGETED_FAILURE_COPY[name];
  if (hit !== undefined) return { ...hit, raw };
  return mapRadioFailure(err);
}
