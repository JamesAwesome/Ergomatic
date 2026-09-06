// Phase NF: scripted NFC reader (dev harness). The instrument the design
// spec's "Instrumentation and replay" §1 names: unit, integration and e2e
// tests feed NATIVE-SHAPED record and session-ending events through the
// production bridge, parser and detail coordinator, so the routed
// Scan-NFC-to-`armed` proof starts upstream of every producer (RF24).
// Reached only through `adapters/nfcReader.ts`'s fold-away gate; the
// literal in this header is `scripts/dist-grep.sh`'s needle for proving
// this file never ships.

import type { NfcRecord } from "../../../domain/monitor/nfc.js";
import {
  NfcAbortError,
  NfcCancelledError,
  NfcInvalidatedError,
  NfcStartError,
  NfcTimeoutError,
  type NfcCapability,
  type NfcReadOptions,
  type NfcReader,
} from "../../adapters/nfcReader";
import { decodeNfcEvent } from "./nfcBridge";

export interface NfcScript {
  /** `"rejects"` makes the probe itself fail (a plugin that will not
   *  load), the `capability-failed` path; `"hangs"` never answers, the
   *  `capability-timed-out` path. */
  capability: NfcCapability | "rejects" | "hangs";
  /** What the reader delivers for the attempt. `records` are delivered as
   *  a native-shaped `nfcEvent` carrying the attempt ID and pass through
   *  the production bridge, exactly like the plugin's own event. */
  outcome:
    | { kind: "records"; records: readonly NfcRecord[] }
    | { kind: "cancelled" }
    | { kind: "timeout" }
    | { kind: "invalidated"; cause?: "multipleTags" | "tagFailure" }
    | { kind: "start-failed" };
  /** Optional: deliver the outcome only once this resolves, so a test can
   *  interleave an abort or a background transition first. */
  gate?: Promise<void>;
  /** Optional: called the moment a session is requested (after the
   *  `session-requested` trace entry), so a test can time an abort AFTER the
   *  reader is live rather than racing the registration that precedes it. */
  onStart?: () => void;
}

export interface ScriptedNfcReader extends NfcReader {
  /** How many sessions were started. */
  starts(): number;
  /** Every attempt ID the reader was told to stop, in order. */
  stops(): readonly string[];
}

export function createScriptedNfcReader(script: NfcScript): ScriptedNfcReader {
  let starts = 0;
  const stops: string[] = [];
  return {
    capability: () =>
      script.capability === "rejects"
        ? Promise.reject(new Error("scripted capability rejection"))
        : script.capability === "hangs"
          ? new Promise<NfcCapability>(() => undefined)
          : Promise.resolve(script.capability),
    async readOne({ attemptId, signal, trace }: NfcReadOptions) {
      if (signal.aborted) throw new NfcAbortError();
      trace.record("session-requested");
      starts += 1;
      script.onStart?.();
      let aborted = false;
      const onAbort = (): void => {
        aborted = true;
        trace.record("abort-requested");
      };
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        // Same shape as the native arm: a start failure is still followed by
        // the stop and the `reader-settled` entry (lens 2: the instrument
        // must not diverge from the arm it stands in for).
        if (script.outcome.kind === "start-failed") {
          trace.record("start-failed");
          throw new NfcStartError("scripted start failure");
        }
        if (script.gate) await script.gate;
        if (aborted) throw new NfcAbortError();
        const outcome = script.outcome;
        switch (outcome.kind) {
          case "records": {
            // Native-shaped, through the production bridge — never handed
            // to the parser directly.
            const decoded = decodeNfcEvent(
              {
                attemptId,
                type: "ndef",
                tag: {
                  ndefMessage: outcome.records.map((r) => ({
                    tnf: r.tnf,
                    type: [...r.type],
                    id: [],
                    payload: [...r.payload],
                  })),
                },
              },
              attemptId,
            );
            if ("error" in decoded) {
              // Same terminal the native arm gives a malformed event that
              // carries this attempt's ID (F3): a tag failure.
              trace.record("invalid-native-event");
              throw new NfcInvalidatedError("tagFailure");
            }
            trace.record("tag-event");
            return decoded.records;
          }
          case "cancelled":
            throw new NfcCancelledError();
          case "timeout":
            throw new NfcTimeoutError();
          case "invalidated":
            throw new NfcInvalidatedError(outcome.cause);
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
        stops.push(attemptId);
        trace.record("reader-settled");
      }
    },
    starts: () => starts,
    stops: () => stops.slice(),
  };
}
