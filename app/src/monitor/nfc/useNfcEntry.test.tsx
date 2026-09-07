// The two seams `useNfcEntry` owns that no screen test reaches (RF2: the
// aggregate gate hid them while the block lived inline in WorkoutDetail):
// a lifecycle listener that will not register, and a capability probe that
// times out.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { setAttemptIdMintForTests } from "./attemptIdMint";
import { resetNfcCapabilityCacheForTests } from "./nfcCapabilityCache";
import {
  latestConnectionAttemptTrace,
  resetConnectionAttemptTraceForTests,
} from "./connectionAttemptTrace";
import {
  resetForTests as resetHandoffStoreForTests,
  stageRetire,
  stagedRetireAttemptId,
} from "../handoffStore";
import type { NfcScript } from "./scriptedNfcReader";

const lifecycle = vi.hoisted(() => ({
  register: vi.fn<() => Promise<() => void>>(),
}));
vi.mock("../../adapters/appLifecycle", () => ({
  registerAppLifecycleListener: lifecycle.register,
}));

const ATTEMPT = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";

function setNfcScript(script: NfcScript | null): void {
  if (script === null) delete window.__nfcScript__;
  else window.__nfcScript__ = script;
}

beforeEach(() => {
  resetHandoffStoreForTests();
  resetNfcCapabilityCacheForTests();
  resetConnectionAttemptTraceForTests();
  setAttemptIdMintForTests(() => ATTEMPT);
  lifecycle.register.mockResolvedValue(() => undefined);
});
afterEach(() => {
  setNfcScript(null);
  setAttemptIdMintForTests(null);
  vi.useRealTimers();
});

describe("useNfcEntry", () => {
  it("a lifecycle listener that will not register ends the attempt with the approved stopped line, discards the staged receipt, and frees the buttons", async () => {
    setNfcScript({ capability: "supported", outcome: { kind: "cancelled" } });
    lifecycle.register.mockRejectedValue(new Error("no plugin"));
    const { useNfcEntry } = await import("./useNfcEntry");
    const { result } = renderHook(() => useNfcEntry());
    stageRetire(
      [{ sessionKey: "2026-09-06T00:00:00.000Z", revision: 0 }],
      ATTEMPT,
    );
    const onInlineError = vi.fn();
    const onTarget = vi.fn(() => true);
    await act(async () => {
      await result.current.run(ATTEMPT, { onTarget, onInlineError });
    });
    expect(onInlineError).toHaveBeenCalledWith("NFC scan stopped. Try again.");
    expect(onTarget).not.toHaveBeenCalled();
    expect(stagedRetireAttemptId()).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(latestConnectionAttemptTrace()?.map((e) => e.kind)).toStrictEqual([
      "listener-registration-failed",
    ]);
  });

  it("a capability probe that never answers leaves the button absent (unknown) and publishes capability-timed-out on a fresh process", async () => {
    vi.useFakeTimers();
    const { useNfcEntry } = await import("./useNfcEntry");
    setNfcScript({ capability: "hangs", outcome: { kind: "cancelled" } });
    const { result } = renderHook(() => useNfcEntry());
    expect(result.current.capability).toBe("unknown");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.capability).toBe("unknown");
    expect(latestConnectionAttemptTrace()?.map((e) => e.kind)).toStrictEqual([
      "capability-timed-out",
    ]);
  });

  it("unmounting mid-read aborts the attempt: quiet, receipt discarded", async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    let started!: () => void;
    const live = new Promise<void>((r) => {
      started = r;
    });
    setNfcScript({
      capability: "supported",
      outcome: { kind: "cancelled" },
      gate,
      onStart: () => started(),
    });
    const { useNfcEntry } = await import("./useNfcEntry");
    const { result, unmount } = renderHook(() => useNfcEntry());
    stageRetire(
      [{ sessionKey: "2026-09-06T00:00:00.000Z", revision: 0 }],
      ATTEMPT,
    );
    const onInlineError = vi.fn();
    let done!: Promise<void>;
    act(() => {
      done = result.current.run(ATTEMPT, {
        onTarget: () => true,
        onInlineError,
      });
    });
    await waitFor(() => expect(result.current.busy).toBe(true));
    // Unmount only once the reader is LIVE, or the abort lands on the
    // pre-start check and records nothing (a real race, seen under load).
    await live;
    unmount();
    open();
    await done;
    expect(onInlineError).not.toHaveBeenCalled();
    expect(stagedRetireAttemptId()).toBeNull();
    expect(latestConnectionAttemptTrace()?.map((e) => e.kind)).toContain(
      "abort-requested",
    );
  });
});
