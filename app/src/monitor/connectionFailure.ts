import type { ProgramRejectionReason } from "./driver";

/**
 * Every way this flow can fail, typed (the spec's exit criterion: "every
 * failure path is typed and rendered; no untyped path"). The first arm is
 * the driver's own union — MACHINE STATEMENTS, things the PM5 said or
 * failed to say (`ProgramRejection`'s own doc comment) — and the remaining
 * members are OURS, about the phone side of the radio:
 *
 * - `"busy"` — `ProgramBusyError`, thrown before a second `program()` ever
 *   reaches the wire. Deliberately NOT a `ProgramRejectionReason` (spec's
 *   I6 ruling): the machine never saw the call, so rendering "The monitor
 *   rejected" copy for it would be a lie about it.
 * - `"transport-missing"` — no radio at all on this platform/build.
 * - `"scan-dismissed"` — the rower closed the monitor chooser (or it
 *   returned nothing). Not an error in any moral sense; it renders on state 6's
 *   skeleton with a retry, per the C2 ruling. Second producer: the scan
 *   timeout (phone-BLE §3.3) — same retry surface, its own detail line.
 * - `"permission-denied"` — iOS declined the Bluetooth permission; iOS
 *   never re-asks — the remedy is Settings, and the card carries the door.
 * - `"bluetooth-off"` — the ADAPTER itself is unavailable: off, blocked, or
 *   absent from this browser. The one remedy is "turn Bluetooth on", and
 *   that is the only situation this reason is allowed to describe.
 * - `"link-failed"` — **WIDENS THE SPEC'S FIXED UNION** (design spec §2's
 *   error block, DEVIATIONS row; task-4 review MEDIUM-4 adjudicated it).
 *   The radio worked, the pairing may well have succeeded, and then the
 *   link failed anyway: a dead GATT handle mid-program (D6's
 *   `InvalidStateError`), a `connect()` that throws for a reason no adapter
 *   documents. Without this member all of those collapsed onto
 *   `"bluetooth-off"` and rendered "check Bluetooth" at a rower whose
 *   Bluetooth is demonstrably ON — the review found the argument split
 *   between `useMonitorSession.ts`'s `mapProgramFailure` and
 *   `mapRadioFailure` below: both produce this tag with step-specific prose,
 *   so the code did not itself believe these were one failure.
 *   Task 5's copy keys on `reason`, so the tag is what a rower actually
 *   reads. The remedy differs too: try again / wake the monitor, not
 *   "turn something on".
 *
 * `detail` is copy-ready prose; `raw` is the un-prettified evidence (a
 * `ProgramRejectionError`'s own hex trace, or a thrown error's message) for
 * state 6's DETAIL panel.
 */
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
