// Phase NF follow-on (design spec 2026-09-06, "Design" 1): THE NFC ENTRY,
// shared by workout detail and Just Row. Owns what every NFC-capable screen
// needs and nothing a screen decides: one reader per mount, the capability
// probe, the busy/accepted flags `ConnectAction` renders, the live
// attempt's abort owner (aborted on unmount and on foreground loss —
// `pause`, never the ACTIVE/INACTIVE axis, hardening lens 1 F1), the
// connection-attempt trace, and the one INVARIANT the two screens share
// (lens 1, F7): every outcome except a target the caller accepts discards
// this attempt's staged receipt by ID before the buttons come back.
//
// What differs per screen is injected per attempt: `onTarget` — where a
// decoded PM5 name goes (detail hands it to the interstitial; Just Row
// calls `session.connect(request, trace)` itself and owns the session) —
// and `onInlineError` — where an inline outcome renders.
//
// LIFETIMES (RF27), unchanged from the detail-inline version this replaces:
// `abortRef` is minted per attempt at `run()`, cleared in the attempt's
// `finally` by identity, aborted on unmount; `mountedRef` is true for the
// mount and false from cleanup; the capability cache is process-scoped and
// resolution-only (`nfcCapabilityCache.ts`); the trace is minted per
// attempt and completed HERE only when the caller did not take the target
// — a handed-off trace is completed by the session at its own terminal.

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { registerAppLifecycleListener } from "../../adapters/appLifecycle";
import { successHaptic } from "../../adapters/haptics";
import {
  resolveNfcReader,
  type NfcCapability,
  type NfcReader,
} from "../../adapters/nfcReader";
import type {
  ConnectionAttemptId,
  MonitorDiscoveryRequest,
} from "../../../domain/monitor/types.js";
import { discardStagedRetire } from "../handoffStore";
import {
  createConnectionAttemptTrace,
  latestConnectionAttemptTrace,
  type ConnectionAttemptTrace,
} from "./connectionAttemptTrace";
import {
  cacheNfcCapability,
  readCachedNfcCapability,
} from "./nfcCapabilityCache";
import { paintBarrier } from "./paintBarrier";
import { runNfcAttempt, type NfcInlineCopy } from "./runNfcAttempt";

/** Phase NF: the NFC capability probe. `"unknown"` renders nothing (the
 *  spec's absent layout), `"supported"` renders Scan NFC. A resolution is
 *  cached for the PROCESS (never persisted); a rejection or a timeout keeps
 *  `"unknown"`, records a distinct trace outcome, and is NOT cached, so the
 *  next mount retries (hardening lens 1, F11: one hiccup at first mount must
 *  not hide the button for the whole process). The 2_000 ms deadline is a
 *  fail-closed bound, ~50x the measured `capabilityLatencyMs` of 41 ms
 *  (`normal-trace-v8-receipt.json`). */
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
    // The probe is not an attempt: it publishes ONLY while no attempt has
    // completed in this process (the mount-time case, where a rejected or
    // timed-out probe would otherwise reach no sink at all — whole-branch
    // review B3), and never clobbers a real attempt's snapshot on a device
    // whose probe is flaky (lens 2).
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

export interface NfcAttemptSinks {
  /** Where a decoded target goes. Returns whether the screen TOOK it (a
   *  handoff); `false` means the screen showed its own reason and the
   *  attempt's staged receipt is discarded here. */
  onTarget(
    request: MonitorDiscoveryRequest,
    trace: ConnectionAttemptTrace,
  ): boolean;
  /** Where an inline outcome renders (the states table's inline copies, or
   *  the approved "stopped" line for a seam that broke). */
  onInlineError(copy: NfcInlineCopy): void;
}

export interface NfcEntry {
  capability: NfcCapabilityState;
  /** True for the whole attempt: both hardware buttons are disabled. */
  busy: boolean;
  /** `✓ PM5 found`, for one committed paint before the handoff. */
  accepted: boolean;
  run(attemptId: ConnectionAttemptId, sinks: NfcAttemptSinks): Promise<void>;
}

export function useNfcEntry(): NfcEntry {
  const [reader] = useState<NfcReader>(() => resolveNfcReader());
  const capability = useNfcCapability(reader);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  async function run(
    attemptId: ConnectionAttemptId,
    sinks: NfcAttemptSinks,
  ): Promise<void> {
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const trace: ConnectionAttemptTrace = createConnectionAttemptTrace();
    let unsubscribe: (() => void) | null = null;
    let handedOff = false;
    try {
      // Inside the try (lens 2): a rejected registration must still run
      // the finally below, or the buttons stay disabled for good.
      try {
        unsubscribe = await registerAppLifecycleListener((event) => {
          if (event === "background") {
            trace.record("foreground-abort");
            controller.abort();
          }
        });
      } catch {
        trace.record("listener-registration-failed", "entry lifecycle");
        throw new Error("lifecycle listener registration failed");
      }
      const outcome = await runNfcAttempt({
        attemptId,
        reader,
        trace,
        signal: controller.signal,
        haptic: successHaptic,
        paint: (signal) => paintBarrier(signal),
        // Committed SYNCHRONOUSLY so the two frames the barrier counts come
        // after the accepted state is on screen (lens 1, F10).
        onAccepted: () => {
          if (mountedRef.current) flushSync(() => setAccepted(true));
        },
      });
      if (!mountedRef.current) return;
      if (outcome.kind === "target") {
        handedOff = sinks.onTarget(
          {
            kind: "advertised-name",
            attemptId,
            exactName: outcome.target.advertisingName,
          },
          trace,
        );
      } else if (outcome.kind === "inline-error") {
        sinks.onInlineError(outcome.copy);
      }
    } catch {
      // Any throw out of the attempt (a listener that would not register,
      // a seam that broke) is the approved "stopped" copy, never silence.
      if (mountedRef.current) {
        sinks.onInlineError("NFC scan stopped. Try again.");
      }
    } finally {
      unsubscribe?.();
      // A handed-off trace is completed by the SESSION at its own terminal
      // (ring-prefix copy or targeted failure, `useMonitorSession.ts`);
      // completing it here would publish a snapshot taken before the
      // targeted scan ever ran (whole-branch review B3).
      if (!handedOff) trace.complete();
      if (abortRef.current === controller) abortRef.current = null;
      if (!handedOff) discardStagedRetire(attemptId);
      if (mountedRef.current) {
        setAccepted(false);
        setBusy(false);
      }
    }
  }

  return { capability, busy, accepted, run };
}
