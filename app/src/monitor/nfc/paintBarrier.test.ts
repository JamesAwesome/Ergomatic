import { describe, expect, it } from "vitest";
import { paintBarrier } from "./paintBarrier";

/** A hand-driven frame queue: `fire()` runs the callbacks queued so far
 *  (one frame), in order. */
function frameQueue() {
  const queued: { id: number; cb: () => void }[] = [];
  let next = 1;
  const cancelled: number[] = [];
  return {
    cancelled,
    pending: () => queued.length,
    requestFrame(cb: () => void): number {
      const id = next++;
      queued.push({ id, cb });
      return id;
    },
    cancelFrame(id: number): void {
      cancelled.push(id);
      const i = queued.findIndex((q) => q.id === id);
      if (i >= 0) queued.splice(i, 1);
    },
    fire(): void {
      for (const { cb } of queued.splice(0)) cb();
    },
  };
}

async function settled(
  p: Promise<unknown>,
): Promise<"pending" | "resolved" | "rejected"> {
  let state: "pending" | "resolved" | "rejected" = "pending";
  p.then(
    () => {
      state = "resolved";
    },
    () => {
      state = "rejected";
    },
  );
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  return state;
}

describe("paintBarrier", () => {
  it("does not resolve after one frame, resolves after two", async () => {
    const q = frameQueue();
    const p = paintBarrier(new AbortController().signal, q);
    void p.catch(() => undefined);
    q.fire();
    expect(await settled(p)).toBe("pending");
    q.fire();
    expect(await settled(p)).toBe("resolved");
  });

  it("rejects by name and cancels the pending frame when aborted between frames", async () => {
    const q = frameQueue();
    const ac = new AbortController();
    const p = paintBarrier(ac.signal, q);
    q.fire();
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "PaintBarrierAbortedError" });
    expect(q.cancelled).toHaveLength(1);
    expect(q.pending()).toBe(0);
  });

  it("rejects immediately on a pre-aborted signal without requesting a frame", async () => {
    const q = frameQueue();
    const ac = new AbortController();
    ac.abort();
    await expect(paintBarrier(ac.signal, q)).rejects.toMatchObject({
      name: "PaintBarrierAbortedError",
    });
    expect(q.pending()).toBe(0);
  });

  it("uses no timer: the barrier is frames, not milliseconds", async () => {
    const { vi } = await import("vitest");
    vi.useFakeTimers();
    try {
      const q = frameQueue();
      const p = paintBarrier(new AbortController().signal, q);
      void p.catch(() => undefined);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await settled(p)).toBe("pending");
      q.fire();
      q.fire();
      expect(await settled(p)).toBe("resolved");
    } finally {
      vi.useRealTimers();
    }
  });
});
