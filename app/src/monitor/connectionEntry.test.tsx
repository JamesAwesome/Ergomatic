import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitorSession } from "./useMonitorSession";
import {
  resetForTests as resetHandoffStoreForTests,
  stageRetire,
  stagedRetireAttemptId,
} from "./handoffStore";
import { resetMountLeasesForTests } from "./mountLease";
import {
  latestConnectionAttemptTrace,
  resetConnectionAttemptTraceForTests,
  type ConnectionAttemptTrace,
} from "./nfc/connectionAttemptTrace";
import { resetNfcCapabilityCacheForTests } from "./nfc/nfcCapabilityCache";
import { FIXTURE_PM5_NAME, loadPm5NfcFixture } from "./nfc/fixtures";
import type { NfcScript } from "./nfc/scriptedNfcReader";
import {
  useConnectionEntry,
  useConnectionEntryLifetime,
  type ConnectionEntryAttempt,
  type ConnectionEntryOffer,
} from "./connectionEntry";

const lifecycle = vi.hoisted(() => ({
  register: vi.fn<() => Promise<() => void>>(),
}));
vi.mock("../adapters/appLifecycle", () => ({
  registerAppLifecycleListener: lifecycle.register,
}));

const A = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const B = "9d1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const A_INTENT = { kind: "manual", attemptId: A } as const;
const B_INTENT = { kind: "manual", attemptId: B } as const;
const fixture = loadPm5NfcFixture().records;
type EntrySession = Pick<MonitorSession, "connect" | "cancel">;

function setNfcScript(script: NfcScript | null): void {
  if (script === null) delete window.__nfcScript__;
  else window.__nfcScript__ = script;
}

function staged(attemptId = A): void {
  stageRetire(
    { sessionKey: "2026-09-17T00:00:00.000Z", revision: 0 },
    attemptId,
  );
}

function makeSession(
  connect: MonitorSession["connect"] = async () => undefined,
  cancel: MonitorSession["cancel"] = async () => undefined,
): EntrySession {
  return { connect: vi.fn(connect), cancel: vi.fn(cancel) };
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

function claimManual(
  entry: ReturnType<typeof useConnectionEntry>,
  intent = A_INTENT,
): ConnectionEntryAttempt {
  let attempt!: ConnectionEntryAttempt;
  act(() => {
    entry.begin(intent, {
      onReady: (offer) => {
        attempt = offer.claim();
      },
      onInlineError: vi.fn(),
    });
  });
  return attempt;
}

async function renderTargeted(attemptId = A): Promise<{
  owner: ReturnType<
    typeof renderHook<ReturnType<typeof useConnectionEntry>, unknown>
  >;
  attempt: ConnectionEntryAttempt;
}> {
  setNfcScript({
    capability: "supported",
    outcome: { kind: "records", records: fixture },
  });
  const requestFrame = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((cb) => {
      queueMicrotask(() => cb(performance.now()));
      return 1;
    });
  const cancelFrame = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation(() => undefined);
  const owner = renderHook(() => useConnectionEntry());
  await waitFor(() =>
    expect(owner.result.current.capability).toBe("supported"),
  );
  resetConnectionAttemptTraceForTests();
  let attempt!: ConnectionEntryAttempt;
  try {
    await act(async () => {
      owner.result.current.begin(
        { kind: "nfc", attemptId },
        {
          onReady: (offer) => {
            attempt = offer.claim();
          },
          onInlineError: vi.fn(),
        },
      );
      await drainMicrotasks();
    });
    await waitFor(() => expect(attempt).toBeDefined());
  } finally {
    requestFrame.mockRestore();
    cancelFrame.mockRestore();
  }
  return { owner, attempt };
}

beforeEach(() => {
  resetHandoffStoreForTests();
  resetMountLeasesForTests();
  resetNfcCapabilityCacheForTests();
  resetConnectionAttemptTraceForTests();
  lifecycle.register.mockReset();
  lifecycle.register.mockResolvedValue(() => undefined);
  setNfcScript({ capability: "hangs", outcome: { kind: "cancelled" } });
});

afterEach(() => {
  setNfcScript(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useConnectionEntry released NFC behavior", () => {
  it("listener registration failure shows the stopped copy, discards by key, publishes the trace, and restores controls", async () => {
    setNfcScript({ capability: "supported", outcome: { kind: "cancelled" } });
    lifecycle.register.mockRejectedValue(new Error("no plugin"));
    const { result } = renderHook(() => useConnectionEntry());
    staged();
    const onReady = vi.fn();
    const onInlineError = vi.fn();
    act(() => {
      result.current.begin(
        { kind: "nfc", attemptId: A },
        { onReady, onInlineError },
      );
    });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(onInlineError).toHaveBeenCalledWith("NFC scan stopped. Try again.");
    expect(onReady).not.toHaveBeenCalled();
    expect(stagedRetireAttemptId()).toBeNull();
    expect(latestConnectionAttemptTrace()?.map((e) => e.kind)).toStrictEqual([
      "listener-registration-failed",
    ]);
  });

  it("a capability timeout stays unknown and publishes capability-timed-out", async () => {
    vi.useFakeTimers();
    setNfcScript({ capability: "hangs", outcome: { kind: "cancelled" } });
    const { result } = renderHook(() => useConnectionEntry());
    expect(result.current.capability).toBe("unknown");
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(result.current.capability).toBe("unknown");
    expect(latestConnectionAttemptTrace()?.map((e) => e.kind)).toStrictEqual([
      "capability-timed-out",
    ]);
  });

  it("unmounting a live read aborts quietly, discards by key, and publishes abort-requested", async () => {
    const gate = deferred();
    const live = deferred();
    setNfcScript({
      capability: "supported",
      outcome: { kind: "cancelled" },
      gate: gate.promise,
      onStart: () => live.resolve(),
    });
    const owner = renderHook(() => useConnectionEntry());
    staged();
    const onReady = vi.fn();
    const onInlineError = vi.fn();
    act(() => {
      owner.result.current.begin(
        { kind: "nfc", attemptId: A },
        { onReady, onInlineError },
      );
    });
    await live.promise;
    owner.unmount();
    gate.resolve();
    await drainMicrotasks();
    expect(onReady).not.toHaveBeenCalled();
    expect(onInlineError).not.toHaveBeenCalled();
    expect(stagedRetireAttemptId()).toBeNull();
    expect(latestConnectionAttemptTrace()?.map((e) => e.kind)).toContain(
      "abort-requested",
    );
  });
});

describe("offer transfer", () => {
  it("delivers a manual offer synchronously with a null target and abandons it when the callback returns unclaimed", async () => {
    const { result } = renderHook(() => useConnectionEntry());
    staged();
    const captured: { offer?: ConnectionEntryOffer } = {};
    let callbackRan = false;
    act(() => {
      result.current.begin(A_INTENT, {
        onReady: (offer) => {
          callbackRan = true;
          captured.offer = offer;
        },
        onInlineError: vi.fn(),
      });
    });
    expect(callbackRan).toBe(true);
    expect(stagedRetireAttemptId()).toBeNull();
    const inert = captured.offer!.claim();
    expect(inert.targetName).toBeNull();
    expect(captured.offer!.claim()).toBe(inert);
    const session = makeSession();
    await inert.connect(session);
    expect(session.connect).not.toHaveBeenCalled();
  });

  it("delivers the exact NFC target only after the accepted paint barrier", async () => {
    setNfcScript({
      capability: "supported",
      outcome: { kind: "records", records: fixture },
    });
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      () => undefined,
    );
    const { result } = renderHook(() => useConnectionEntry());
    await waitFor(() => expect(result.current.capability).toBe("supported"));
    let attempt: ConnectionEntryAttempt | undefined;
    act(() => {
      result.current.begin(
        { kind: "nfc", attemptId: A },
        {
          onReady: (offer) => {
            attempt = offer.claim();
          },
          onInlineError: vi.fn(),
        },
      );
    });
    await waitFor(() => expect(result.current.accepted).toBe(true));
    expect(attempt).toBeUndefined();
    await act(async () => frames.shift()!(performance.now()));
    expect(attempt).toBeUndefined();
    await act(async () => frames.shift()!(performance.now()));
    await waitFor(() => expect(attempt?.targetName).toBe(FIXTURE_PM5_NAME));
  });

  it("abandons and rethrows a manual callback failure before claim", () => {
    const { result } = renderHook(() => useConnectionEntry());
    staged();
    expect(() => {
      act(() => {
        result.current.begin(A_INTENT, {
          onReady: () => {
            throw new Error("compile exploded");
          },
          onInlineError: vi.fn(),
        });
      });
    }).toThrow("compile exploded");
    expect(stagedRetireAttemptId()).toBeNull();
  });

  it("abandons a claimed handle when the manual callback throws", async () => {
    const { result } = renderHook(() => useConnectionEntry());
    staged();
    let attempt!: ConnectionEntryAttempt;
    expect(() => {
      act(() => {
        result.current.begin(A_INTENT, {
          onReady: (offer) => {
            attempt = offer.claim();
            throw new Error("render exploded");
          },
          onInlineError: vi.fn(),
        });
      });
    }).toThrow("render exploded");
    const session = makeSession();
    await attempt.connect(session);
    expect(session.connect).not.toHaveBeenCalled();
    expect(stagedRetireAttemptId()).toBeNull();
  });

  it("maps an NFC callback throw through the stopped copy and makes a claimed handle inert", async () => {
    setNfcScript({
      capability: "supported",
      outcome: { kind: "records", records: fixture },
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      queueMicrotask(() => cb(performance.now()));
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      () => undefined,
    );
    const { result } = renderHook(() => useConnectionEntry());
    await waitFor(() => expect(result.current.capability).toBe("supported"));
    staged();
    let attempt!: ConnectionEntryAttempt;
    const onInlineError = vi.fn();
    act(() => {
      result.current.begin(
        { kind: "nfc", attemptId: A },
        {
          onReady: (offer) => {
            attempt = offer.claim();
            throw new Error("target callback exploded");
          },
          onInlineError,
        },
      );
    });
    await waitFor(() =>
      expect(onInlineError).toHaveBeenCalledWith(
        "NFC scan stopped. Try again.",
      ),
    );
    const session = makeSession();
    await attempt.connect(session);
    expect(session.connect).not.toHaveBeenCalled();
    expect(stagedRetireAttemptId()).toBeNull();
  });

  it("maps an NFC callback throw before claim through the stopped copy", async () => {
    setNfcScript({
      capability: "supported",
      outcome: { kind: "records", records: fixture },
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      queueMicrotask(() => cb(performance.now()));
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(
      () => undefined,
    );
    const { result } = renderHook(() => useConnectionEntry());
    await waitFor(() => expect(result.current.capability).toBe("supported"));
    staged();
    const onInlineError = vi.fn();
    act(() => {
      result.current.begin(
        { kind: "nfc", attemptId: A },
        {
          onReady: () => {
            throw new Error("target callback exploded");
          },
          onInlineError,
        },
      );
    });
    await waitFor(() =>
      expect(onInlineError).toHaveBeenCalledWith(
        "NFC scan stopped. Try again.",
      ),
    );
    expect(stagedRetireAttemptId()).toBeNull();
  });

  it("fails closed for a cast structural attempt before a mount lease is installed", () => {
    const foreign = {
      targetName: null,
      connect: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
    } as unknown as ConnectionEntryAttempt;
    expect(() => renderHook(() => useConnectionEntryLifetime(foreign))).toThrow(
      "connection-entry attempt was not created by this owner",
    );
  });

  it("refuses B while A is claimed without changing A or invoking radio", async () => {
    const { result } = renderHook(() => useConnectionEntry());
    staged(A);
    const a = claimManual(result.current);
    staged(B);
    const onReadyB = vi.fn();
    act(() => {
      result.current.begin(B_INTENT, {
        onReady: onReadyB,
        onInlineError: vi.fn(),
      });
    });
    expect(onReadyB).not.toHaveBeenCalled();
    expect(stagedRetireAttemptId()).toBeNull();
    const session = makeSession();
    await a.connect(session);
    expect(session.connect).toHaveBeenCalledTimes(1);
  });
});

describe("attempt session projection", () => {
  it("manual retry reuses one request, shares the exact promise, and connect-bound Cancel ignores a foreign collaborator", async () => {
    const { result } = renderHook(() => useConnectionEntry());
    const attempt = claimManual(result.current);
    const held = deferred();
    const first = makeSession(() => held.promise);
    const foreign = makeSession();
    const p1 = attempt.connect(first);
    const p2 = attempt.connect(foreign);
    expect(p2).toBe(p1);
    expect(first.connect).toHaveBeenCalledTimes(1);
    expect(foreign.connect).not.toHaveBeenCalled();
    held.resolve();
    await p1;
    await attempt.connect(foreign);
    expect(first.connect).toHaveBeenCalledTimes(2);
    expect(foreign.connect).not.toHaveBeenCalled();
    expect(vi.mocked(first.connect).mock.calls[1]?.[0]).toBe(
      vi.mocked(first.connect).mock.calls[0]?.[0],
    );
    await act(async () => attempt.cancel(foreign));
    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(foreign.connect).not.toHaveBeenCalled();
    expect(foreign.cancel).not.toHaveBeenCalled();
  });

  it("targeted retry reuses the exact request and trace, and connect-bound Cancel ignores a foreign collaborator", async () => {
    const { owner, attempt } = await renderTargeted();
    const session = makeSession();
    const foreign = makeSession();
    await attempt.connect(session);
    await attempt.connect(session);
    expect(vi.mocked(session.connect).mock.calls[1]?.[0]).toBe(
      vi.mocked(session.connect).mock.calls[0]?.[0],
    );
    expect(vi.mocked(session.connect).mock.calls[1]?.[1]).toBe(
      vi.mocked(session.connect).mock.calls[0]?.[1],
    );
    await act(async () => attempt.cancel(foreign));
    expect(session.cancel).toHaveBeenCalledTimes(1);
    expect(foreign.connect).not.toHaveBeenCalled();
    expect(foreign.cancel).not.toHaveBeenCalled();
    owner.unmount();
  });

  it("binding through cancel captures the original pair and never calls a later object", async () => {
    const { result } = renderHook(() => useConnectionEntry());
    const attempt = claimManual(result.current);
    const held = deferred();
    const first = makeSession(undefined, () => held.promise);
    const foreign = makeSession();
    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = attempt.cancel(first);
      p2 = attempt.cancel(foreign);
    });
    expect(p2).toBe(p1);
    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(foreign.cancel).not.toHaveBeenCalled();
    await act(async () => {
      held.resolve();
      await p1;
    });
  });
});

describe("Cancel drain", () => {
  it("enters busy synchronously, discards after Cancel's synchronous prefix, blocks radio and B, and releases on Cancel settlement", async () => {
    const { result } = renderHook(() => useConnectionEntry());
    staged(A);
    const attempt = claimManual(result.current);
    const connectHeld = deferred();
    const cancelHeld = deferred();
    const order: string[] = [];
    const session = makeSession(
      () => connectHeld.promise,
      () => {
        order.push(`cancel:${String(stagedRetireAttemptId())}`);
        return cancelHeld.promise;
      },
    );
    const connectPromise = attempt.connect(session);
    let cancelPromise!: Promise<void>;
    act(() => {
      cancelPromise = attempt.cancel(session);
    });
    expect(result.current.busy).toBe(true);
    expect(order).toStrictEqual([`cancel:${A}`]);
    expect(stagedRetireAttemptId()).toBeNull();
    expect(attempt.cancel(session)).toBe(cancelPromise);
    expect(session.cancel).toHaveBeenCalledTimes(1);
    await attempt.connect(session);
    expect(session.connect).toHaveBeenCalledTimes(1);
    staged(B);
    const blockedB = vi.fn();
    act(() => {
      result.current.begin(B_INTENT, {
        onReady: blockedB,
        onInlineError: vi.fn(),
      });
    });
    expect(blockedB).not.toHaveBeenCalled();
    expect(stagedRetireAttemptId()).toBeNull();
    await act(async () => cancelHeld.resolve());
    await cancelPromise;
    expect(result.current.busy).toBe(false);
    let b!: ConnectionEntryAttempt;
    act(() => {
      result.current.begin(B_INTENT, {
        onReady: (offer) => {
          b = offer.claim();
        },
        onInlineError: vi.fn(),
      });
    });
    expect(b.targetName).toBeNull();
    connectHeld.resolve();
    await connectPromise;
    await drainMicrotasks();
    const lateBegin = vi.fn();
    act(() => {
      result.current.begin(A_INTENT, {
        onReady: lateBegin,
        onInlineError: vi.fn(),
      });
    });
    expect(lateBegin).not.toHaveBeenCalled();
  });
});

describe("lifetime ownership", () => {
  it("StrictMode rehearsal reclaims the lease and true detach abandons it", async () => {
    const owner = renderHook(() => useConnectionEntry());
    staged();
    const attempt = claimManual(owner.result.current);
    const lifetime = renderHook(() => useConnectionEntryLifetime(attempt), {
      wrapper: StrictMode,
    });
    await drainMicrotasks();
    expect(stagedRetireAttemptId()).toBe(A);
    lifetime.unmount();
    await drainMicrotasks();
    expect(stagedRetireAttemptId()).toBeNull();
    owner.unmount();
  });

  it("owner unmount abandons a claim made before a conditional lifetime child can mount", async () => {
    const { result, unmount } = renderHook(() => useConnectionEntry());
    staged();
    const attempt = claimManual(result.current);
    unmount();
    await drainMicrotasks();
    const session = makeSession();
    await attempt.connect(session);
    expect(session.connect).not.toHaveBeenCalled();
    expect(stagedRetireAttemptId()).toBeNull();
  });
});

describe("owned trace publication", () => {
  it("held connection cleanup publishes only after the captured work settles", async () => {
    const { owner, attempt } = await renderTargeted();
    const held = deferred();
    let trace!: ConnectionAttemptTrace;
    const session = makeSession((_request, ownedTrace) => {
      trace = ownedTrace!;
      trace.complete();
      trace.record("ble-scan-cleanup-failed");
      return held.promise;
    });
    const work = attempt.connect(session);
    expect(latestConnectionAttemptTrace()?.at(-1)?.kind).not.toBe(
      "ble-scan-cleanup-failed",
    );
    owner.unmount();
    await drainMicrotasks();
    expect(latestConnectionAttemptTrace()?.at(-1)?.kind).not.toBe(
      "ble-scan-cleanup-failed",
    );
    held.resolve();
    await work;
    await drainMicrotasks();
    expect(latestConnectionAttemptTrace()?.at(-1)?.kind).toBe(
      "ble-scan-cleanup-failed",
    );
  });

  it("publishes an evicting append even when the bounded trace length remains 200", async () => {
    const { owner, attempt } = await renderTargeted();
    let trace!: ConnectionAttemptTrace;
    await attempt.connect(
      makeSession(async (_request, ownedTrace) => {
        trace = ownedTrace!;
        for (let i = 0; i < 200; i += 1) trace.record("ble-scan-started");
        trace.complete();
      }),
    );
    expect(latestConnectionAttemptTrace()).toHaveLength(200);
    trace.record("ble-scan-cleanup-failed");
    expect(trace.entries()).toHaveLength(200);
    owner.unmount();
    await drainMicrotasks();
    expect(latestConnectionAttemptTrace()).toHaveLength(200);
    expect(latestConnectionAttemptTrace()?.at(-1)?.kind).toBe(
      "ble-scan-cleanup-failed",
    );
  });

  it("uses an all-settled barrier: one rejection does not publish while its Cancel sibling remains held", async () => {
    const { owner, attempt } = await renderTargeted();
    const cancelHeld = deferred();
    const session = makeSession(
      async (_request, trace) => {
        trace!.complete();
        trace!.record("ble-scan-cleanup-failed");
        throw new Error("connect failed");
      },
      () => cancelHeld.promise,
    );
    const rejected = attempt.connect(session);
    void rejected.catch(() => undefined);
    let cancel!: Promise<void>;
    act(() => {
      cancel = attempt.cancel(session);
    });
    await expect(rejected).rejects.toThrow("connect failed");
    owner.unmount();
    await drainMicrotasks();
    expect(latestConnectionAttemptTrace()?.at(-1)?.kind).not.toBe(
      "ble-scan-cleanup-failed",
    );
    await act(async () => {
      cancelHeld.resolve();
      await cancel;
    });
    await drainMicrotasks();
    expect(latestConnectionAttemptTrace()?.at(-1)?.kind).toBe(
      "ble-scan-cleanup-failed",
    );
  });

  it("a late A cleanup cannot replace the newer B snapshot", async () => {
    const a = await renderTargeted(A);
    const aConnectHeld = deferred();
    const aCancelHeld = deferred();
    let aTrace!: ConnectionAttemptTrace;
    const aSession = makeSession(
      (_request, trace) => {
        aTrace = trace!;
        trace!.complete();
        return aConnectHeld.promise;
      },
      () => aCancelHeld.promise,
    );
    const aConnect = a.attempt.connect(aSession);
    let aCancel!: Promise<void>;
    act(() => {
      aCancel = a.attempt.cancel(aSession);
    });
    await act(async () => {
      aCancelHeld.resolve();
      await aCancel;
    });

    const b = await renderTargeted(B);
    await b.attempt.connect(
      makeSession(async (_request, trace) => {
        trace!.record("ble-scan-matched");
        trace!.complete();
      }),
    );
    expect(latestConnectionAttemptTrace()?.at(-1)?.kind).toBe(
      "ble-scan-matched",
    );
    aTrace.record("ble-scan-cleanup-failed");
    aConnectHeld.resolve();
    await aConnect;
    await drainMicrotasks();
    expect(latestConnectionAttemptTrace()?.at(-1)?.kind).toBe(
      "ble-scan-matched",
    );
    a.owner.unmount();
    b.owner.unmount();
  });
});
