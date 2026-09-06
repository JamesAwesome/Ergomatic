// Phase NF (design spec 2026-09-03 §4, "Workout detail resolves NFC before
// the existing handoff"): the detail coordinator for ONE NFC attempt, steps
// 2-6 of the spec's list. Pure orchestration over injected seams — the
// reader, the haptic, the paint barrier and the trace — so the routed
// Scan-NFC test drives the real thing and a unit test drives each outcome.
//
// The outcome vocabulary is exactly the states table plus the
// "Reader-ending seam" rule:
//   records → parse → target, or `Unsupported NFC tag`
//   NfcCancelledError → quiet (no error)
//   NfcTimeoutError → `No NFC tag detected. Try again.`
//   NfcInvalidatedError, cause multipleTags → `Unsupported NFC tag`
//   any other NfcInvalidatedError, NfcStartError → `NFC scan stopped. Try again.`
//   NfcAbortError (unmount / foreground loss) → quiet
//   NfcUnsupportedError (cannot happen once the button rendered) → `NFC scan stopped. Try again.`
// The haptic is best-effort and never delays the handoff. The accepted state
// is committed by the caller's `onAccepted` (which uses `flushSync`, see
// `WorkoutDetail.tsx`) BEFORE the paint barrier is awaited.

import {
  parsePm5NfcTarget,
  type Pm5NfcTarget,
} from "../../../domain/monitor/nfc.js";
import type { ConnectionAttemptId } from "../../../domain/monitor/types.js";
import type { NfcReader } from "../../adapters/nfcReader";
import type { ConnectionAttemptTrace } from "./connectionAttemptTrace";

export const NFC_ALERT_MESSAGE = "Hold your iPhone near the PM5.";

export type NfcInlineCopy =
  | "Unsupported NFC tag"
  | "No NFC tag detected. Try again."
  | "NFC scan stopped. Try again.";

export type NfcAttemptOutcome =
  | { kind: "target"; target: Pm5NfcTarget }
  | { kind: "inline-error"; copy: NfcInlineCopy }
  | { kind: "quiet" };

export interface RunNfcAttemptDeps {
  attemptId: ConnectionAttemptId;
  reader: NfcReader;
  trace: ConnectionAttemptTrace;
  /** Detail unmount or foreground loss. */
  signal: AbortSignal;
  haptic: () => Promise<void>;
  /** The paint barrier; the caller passes `paintBarrier` bound to the same
   *  signal. */
  paint: (signal: AbortSignal) => Promise<void>;
  /** Commits `✓ PM5 found`. Called BEFORE `paint`. */
  onAccepted: () => void;
}

function endingCopy(err: unknown): NfcAttemptOutcome {
  const name = err instanceof Error ? err.name : "";
  if (name === "NfcCancelledError" || name === "NfcAbortError") {
    return { kind: "quiet" };
  }
  if (name === "NfcTimeoutError") {
    return { kind: "inline-error", copy: "No NFC tag detected. Try again." };
  }
  if (name === "NfcInvalidatedError") {
    const cause = (err as { cause?: unknown }).cause;
    if (cause === "multipleTags") {
      return { kind: "inline-error", copy: "Unsupported NFC tag" };
    }
  }
  return { kind: "inline-error", copy: "NFC scan stopped. Try again." };
}

export async function runNfcAttempt(
  deps: RunNfcAttemptDeps,
): Promise<NfcAttemptOutcome> {
  const { attemptId, reader, trace, signal } = deps;
  let records;
  try {
    records = await reader.readOne({
      attemptId,
      alertMessage: NFC_ALERT_MESSAGE,
      signal,
      trace,
    });
  } catch (err: unknown) {
    return endingCopy(err);
  }
  if (signal.aborted) return { kind: "quiet" };
  const parsed = parsePm5NfcTarget(records);
  if ("code" in parsed) {
    // No detail: the parser's reason strings name the record type (which
    // starts with "PM5 "), and the trace's name guard would redact them.
    // The reasons are pinned by `nfc.test.ts`.
    trace.record("parser-rejected");
    return { kind: "inline-error", copy: "Unsupported NFC tag" };
  }
  trace.record("parser-accepted");
  // Best-effort haptic: instrumented, never awaited ahead of the handoff.
  void deps.haptic().catch(() => trace.record("haptic-failed"));
  deps.onAccepted();
  try {
    await deps.paint(signal);
  } catch {
    // Aborted at the paint boundary: keyed cleanup only, nothing mounts.
    return { kind: "quiet" };
  }
  if (signal.aborted) return { kind: "quiet" };
  trace.record("handoff-accepted");
  return { kind: "target", target: parsed };
}
