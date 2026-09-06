// Phase NF (design spec 2026-09-03, "Instrumentation and replay"): the
// redacted connection-attempt trace. A NEW platform input (Core NFC) enters
// ABOVE the transport recorder, so without this seam every browser/e2e/
// replay gate would replace exactly the code most likely to be wrong
// (RF19). One bounded in-memory trace is created at the hardware press and
// injected through reader, detail coordinator, handoff and session; on a
// successful GATT connect it becomes the prefix of the existing monitor
// event log, and before that the interstitial diagnostics export reads it
// directly. A completed pre-handoff attempt remains as the process-local
// LATEST snapshot until the next completed attempt replaces it.
//
// REDACTION IS STRUCTURAL: the kinds are a closed set, `detail` is optional
// free text that callers may only fill with fixed vocabulary (a code, a
// duration), and `record()` refuses any detail carrying a PM5-shaped name.
// Never an attempt ID, tag UID, BLE address, raw payload or scanned device
// name (spec: "The accepted PM5 display name may join the existing
// connection log only once it is the chosen device").

export type ConnectionAttemptTraceKind =
  | "supported"
  | "unsupported"
  | "capability-failed"
  | "capability-timed-out"
  | "listener-registration-failed"
  | "session-requested"
  | "start-failed"
  | "tag-event"
  | "invalid-native-event"
  | "stale-id-dropped"
  | "parser-accepted"
  | "parser-rejected"
  | "haptic-failed"
  | "reader-settled"
  | "foreground-abort"
  | "held-device-conflict"
  | "ble-scan-started"
  | "ble-scan-matched"
  | "ble-scan-timed-out"
  | "invalid-scan-result"
  | "abort-requested"
  | "scan-drain-settled"
  | "ble-scan-cleanup-failed"
  | "handoff-accepted";

/** Exported for the trace test, which pins the union against this list
 *  with an INDEPENDENT literal array so a kind cannot be added or removed
 *  in one place only. */
export const CONNECTION_ATTEMPT_TRACE_KINDS: readonly ConnectionAttemptTraceKind[] =
  [
    "supported",
    "unsupported",
    "capability-failed",
    "capability-timed-out",
    "listener-registration-failed",
    "session-requested",
    "start-failed",
    "tag-event",
    "invalid-native-event",
    "stale-id-dropped",
    "parser-accepted",
    "parser-rejected",
    "haptic-failed",
    "reader-settled",
    "foreground-abort",
    "held-device-conflict",
    "ble-scan-started",
    "ble-scan-matched",
    "ble-scan-timed-out",
    "invalid-scan-result",
    "abort-requested",
    "scan-drain-settled",
    "ble-scan-cleanup-failed",
    "handoff-accepted",
  ];

export interface ConnectionAttemptTraceEntry {
  seq: number;
  atMs: number;
  kind: ConnectionAttemptTraceKind;
  detail?: string;
}

export interface ConnectionAttemptTrace {
  record(kind: ConnectionAttemptTraceKind, detail?: string): void;
  entries(): readonly ConnectionAttemptTraceEntry[];
  /** Publishes this trace as the process-local latest snapshot
   *  (`latestConnectionAttemptTrace()`), replacing whatever was there. */
  complete(): void;
}

/** Bounded: an attempt that loops (stale retained events, repeated scan
 *  callbacks) cannot grow without limit. */
export const CONNECTION_ATTEMPT_TRACE_CAPACITY = 200;

const KIND_SET = new Set<string>(CONNECTION_ATTEMPT_TRACE_KINDS);

let latest: readonly ConnectionAttemptTraceEntry[] | null = null;

export function createConnectionAttemptTrace(
  now: () => number = () => Date.now(),
): ConnectionAttemptTrace {
  let entries: ConnectionAttemptTraceEntry[] = [];
  let nextSeq = 0;
  return {
    record(kind, detail) {
      if (!KIND_SET.has(kind)) {
        throw new Error(`connectionAttemptTrace: unknown kind ${kind}`);
      }
      if (detail !== undefined && detail.includes("PM5 ")) {
        // The one PM5-shaped string a caller could leak is an advertising
        // name; refusing it here keeps the redaction rule mechanical.
        throw new Error("connectionAttemptTrace: detail must not carry a name");
      }
      const entry: ConnectionAttemptTraceEntry =
        detail === undefined
          ? { seq: nextSeq, atMs: now(), kind }
          : { seq: nextSeq, atMs: now(), kind, detail };
      entries.push(entry);
      nextSeq += 1;
      if (entries.length > CONNECTION_ATTEMPT_TRACE_CAPACITY) {
        entries = entries.slice(
          entries.length - CONNECTION_ATTEMPT_TRACE_CAPACITY,
        );
      }
    },
    entries() {
      return entries.slice();
    },
    complete() {
      latest = entries.slice();
    },
  };
}

/** The most recently COMPLETED attempt's entries, or `null` before any
 *  attempt completed in this process. Diagnostic/test accessor only. */
export function latestConnectionAttemptTrace():
  readonly ConnectionAttemptTraceEntry[] | null {
  return latest;
}

export function resetConnectionAttemptTraceForTests(): void {
  latest = null;
}
