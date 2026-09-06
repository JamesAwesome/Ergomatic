/* v8 ignore start -- thin plugin wrapper (same coverage boundary as every
 * file in this directory, `vitest.config.ts`); `nfc.test.ts` next door
 * mocks the plugin and pins what is OURS: listener-before-start ordering,
 * the exact start options, the ending mapping, stop-by-attempt and the
 * foreground read. The radio itself is proven at the erg. */

// Phase NF (design spec 2026-09-03 §1): the ONLY file that imports
// `@capgo/capacitor-nfc`. Reached from `adapters/nfcReader.ts` by dynamic
// import on the native arm.
//
// Ordering is load-bearing. Capacitor retains native events while JS
// listeners are absent, so both listeners are registered BEFORE
// `startScanning`, and every event is accepted only when its
// native-carried attempt ID equals THIS attempt's (a retained event from
// an earlier document is dropped as `stale-id-dropped`). The app's
// foreground state is re-read immediately before the native start; a
// background state claims the abort before any session exists.
//
// NO PRE-START FOREGROUND READ, on purpose (antagonist delta pass,
// 2026-09-06, F1). A draft gated `startScanning` on `App.getState().isActive`.
// That read returns `AppState` — the exact payload of the `appStateChange`
// event this repo convicted in Phase LM (`src/native/appLifecycle.ts`) —
// and Gate -1's own device console recorded `isActive` going FALSE as a
// normal consequence of the NFC sheet appearing
// (`docs/monitor/sessions/phase-nf-gate-minus-one/BACKGROUND-OBSERVATIONS.md`,
// "Reader start after App.getState returned true. appStateChange false").
// A second tap taken while the previous sheet was still dismissing would
// have been refused silently. Real backgrounding is handled on the correct
// axis: the detail screen aborts this attempt's signal on the `pause` event
// through `adapters/appLifecycle.ts`.

import { CapacitorNfc } from "@capgo/capacitor-nfc";
import type { NfcRecord } from "../../domain/monitor/nfc.js";
import {
  NfcAbortError,
  NfcCancelledError,
  NfcInvalidatedError,
  NfcStartError,
  NfcTimeoutError,
  type NfcReadOptions,
  type NfcReader,
} from "../adapters/nfcReader";
import { decodeNfcEvent } from "../monitor/nfc/nfcBridge";

type Remove = () => Promise<void>;

export function createNativeNfcReader(): NfcReader {
  return {
    async capability() {
      return (await CapacitorNfc.isSupported()).supported
        ? "supported"
        : "unsupported";
    },

    async readOne({
      attemptId,
      alertMessage,
      signal,
      trace,
    }: NfcReadOptions): Promise<readonly NfcRecord[]> {
      if (signal.aborted) throw new NfcAbortError();
      let settled = false;
      let started = false;
      const removers: Remove[] = [];
      let resolveRead!: (records: readonly NfcRecord[]) => void;
      let rejectRead!: (err: Error) => void;
      const read = new Promise<readonly NfcRecord[]>((resolve, reject) => {
        resolveRead = resolve;
        rejectRead = reject;
      });
      // A late rejection after `finish` has already settled must never be
      // an unhandled rejection; the handler is attached once, here.
      read.catch(() => undefined);
      const finish = (err: Error | null, records?: readonly NfcRecord[]) => {
        if (settled) return;
        settled = true;
        if (err !== null) rejectRead(err);
        else resolveRead(records ?? []);
      };
      const onAbort = (): void => {
        trace.record("abort-requested");
        finish(new NfcAbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });

      try {
        const eventHandle = await CapacitorNfc.addListener(
          "nfcEvent",
          (value: unknown) => {
            const decoded = decodeNfcEvent(value, attemptId);
            if ("error" in decoded) {
              if (decoded.error === "invalid-for-attempt") {
                // THIS attempt's tag, unusable: the plugin publishes an
                // event with NO `ndefMessage` when `readNDEF` fails on a
                // read-write tag under `invalidateAfterFirstRead: false`
                // (its `didDetect` read closure), and deliberately does
                // not invalidate, so no ending would ever follow. Terminal
                // here, as a tag failure (antagonist delta pass F3).
                trace.record("invalid-native-event");
                finish(new NfcInvalidatedError("tagFailure"));
                return;
              }
              trace.record(
                decoded.error === "stale-id"
                  ? "stale-id-dropped"
                  : "invalid-native-event",
              );
              return;
            }
            trace.record("tag-event");
            finish(null, decoded.records);
          },
        );
        removers.push(() => eventHandle.remove());
        if (signal.aborted) throw new NfcAbortError();

        const endHandle = await CapacitorNfc.addListener(
          "nfcSessionEnd",
          (value: unknown) => {
            const v =
              typeof value === "object" && value !== null
                ? (value as {
                    attemptId?: unknown;
                    reason?: unknown;
                    cause?: unknown;
                  })
                : {};
            const id = v.attemptId;
            if (typeof id !== "string" || id.length === 0) {
              // An ending we cannot attribute at all: the session on the
              // device HAS ended, nothing else will arrive — terminal, as a
              // tag failure (lens 2, the ending-event twin of F3).
              trace.record("invalid-native-event");
              finish(new NfcInvalidatedError("tagFailure"));
              return;
            }
            if (id !== attemptId) {
              trace.record("stale-id-dropped");
              return;
            }
            const cause =
              v.cause === "multipleTags" || v.cause === "tagFailure"
                ? v.cause
                : undefined;
            if (v.reason === "userCancelled") finish(new NfcCancelledError());
            else if (v.reason === "sessionTimeout")
              finish(new NfcTimeoutError());
            else finish(new NfcInvalidatedError(cause));
          },
        );
        removers.push(() => endHandle.remove());
        if (signal.aborted) throw new NfcAbortError();

        trace.record("session-requested");
        started = true;
        try {
          await CapacitorNfc.startScanning({
            attemptId,
            alertMessage,
            iosSessionType: "ndef",
            invalidateAfterFirstRead: false,
          });
        } catch (err: unknown) {
          trace.record("start-failed");
          throw new NfcStartError(
            err instanceof Error ? err.message : String(err),
          );
        }
        return await read;
      } catch (err: unknown) {
        finish(err instanceof Error ? err : new Error(String(err)));
        return await read;
      } finally {
        signal.removeEventListener("abort", onAbort);
        if (started) {
          // Explicit stop, by attempt ID: the patched controller resolves it
          // only once THIS generation is invalidated and cannot emit. A
          // rejection here is not an ending — the ending event is.
          await CapacitorNfc.stopScanning({ attemptId }).catch(() => {
            // The controller was not told to invalidate this generation —
            // the plausible producer of a stuck sheet. Recorded, never
            // swallowed silently (lens 2).
            trace.record("reader-stop-failed");
          });
        }
        await Promise.all(
          removers.splice(0).map((remove) =>
            remove().catch(() => {
              trace.record("reader-stop-failed", "listener");
            }),
          ),
        );
        trace.record("reader-settled");
      }
    },
  };
}
/* v8 ignore stop */
