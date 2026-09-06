import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimMountLease,
  onMountLeaseLost,
  reclaimMountLease,
  resetMountLeasesForTests,
} from "./mountLease";

const A = "2f1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";
const B = "9d1c9d2e-8a3b-4c7d-9e1f-0a1b2c3d4e5f";

afterEach(() => {
  resetMountLeasesForTests();
});

async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe("mountLease", () => {
  it("StrictMode shape: setup → cleanup → setup within one microtask keeps the lease (no loss)", async () => {
    const lostA = vi.fn();
    onMountLeaseLost(A, lostA);
    const first = claimMountLease(A);
    first.release(); // cleanup
    const reclaimed = reclaimMountLease(A); // replayed setup
    expect(reclaimed).toBe(true);
    await drainMicrotasks();
    expect(lostA).not.toHaveBeenCalled();
  });

  it("a real unmount (release with no reclaim) commits the loss exactly once", async () => {
    const lostA = vi.fn();
    onMountLeaseLost(A, lostA);
    claimMountLease(A).release();
    expect(lostA).not.toHaveBeenCalled(); // not synchronous
    await drainMicrotasks();
    expect(lostA).toHaveBeenCalledTimes(1);
    await drainMicrotasks();
    expect(lostA).toHaveBeenCalledTimes(1);
  });

  it("another attempt ID cannot reclaim A's pending release", async () => {
    const lostA = vi.fn();
    onMountLeaseLost(A, lostA);
    claimMountLease(A).release();
    expect(reclaimMountLease(B)).toBe(false);
    await drainMicrotasks();
    expect(lostA).toHaveBeenCalledTimes(1);
  });

  it("claiming again for the same ID reclaims its own pending release", async () => {
    const lostA = vi.fn();
    onMountLeaseLost(A, lostA);
    claimMountLease(A).release();
    claimMountLease(A);
    await drainMicrotasks();
    expect(lostA).not.toHaveBeenCalled();
  });

  it("reclaim after the release committed is false, and the loss already fired", async () => {
    const lostA = vi.fn();
    onMountLeaseLost(A, lostA);
    claimMountLease(A).release();
    await drainMicrotasks();
    expect(reclaimMountLease(A)).toBe(false);
    expect(lostA).toHaveBeenCalledTimes(1);
  });

  it("carries no duration threshold: the boundary is the microtask queue, not a timer", async () => {
    vi.useFakeTimers();
    try {
      const lostA = vi.fn();
      onMountLeaseLost(A, lostA);
      claimMountLease(A).release();
      expect(vi.getTimerCount()).toBe(0);
      await drainMicrotasks();
      expect(lostA).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
