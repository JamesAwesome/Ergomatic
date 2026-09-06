// Phase NF (design spec 2026-09-03, "User-visible states and copy"): the
// `✓ PM5 found` state must receive ONE real paint before the interstitial
// replaces it. React may batch the accepted-state assignment and the
// interstitial mount into one commit, so the handoff waits on an injected
// barrier of two consecutive `requestAnimationFrame` turns. This promises
// one observable paint, not a time-based delay: there is no timer here, and
// abort/unmount cancels the pending barrier.
//
// INFERENCE, stated as such (hardening lens 1, F10): "two rAF callbacks =
// one committed paint" is not vendor-documented. Two rAFs guarantee one
// rendering opportunity has passed; they guarantee nothing about a React
// commit that is still queued on a task. The caller therefore commits the
// accepted state SYNCHRONOUSLY (`flushSync`) before awaiting this barrier,
// which is what makes the two frames sufficient.

export interface PaintBarrierDeps {
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (handle: number) => void;
}

export class PaintBarrierAbortedError extends Error {
  constructor() {
    super("The paint barrier was aborted before two frames.");
    this.name = "PaintBarrierAbortedError";
  }
}

/** Resolves after two consecutive animation frames; rejects with
 *  `PaintBarrierAbortedError` if `signal` aborts first (the pending frame
 *  request is cancelled). */
export function paintBarrier(
  signal: AbortSignal,
  deps: PaintBarrierDeps = {},
): Promise<void> {
  const requestFrame =
    deps.requestFrame ?? ((cb) => window.requestAnimationFrame(cb));
  const cancelFrame =
    deps.cancelFrame ?? ((h) => window.cancelAnimationFrame(h));
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new PaintBarrierAbortedError());
      return;
    }
    let handle: number | null = null;
    let settled = false;
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      if (handle !== null) cancelFrame(handle);
      reject(new PaintBarrierAbortedError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    handle = requestFrame(() => {
      if (settled) return;
      handle = requestFrame(() => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve();
      });
    });
  });
}
