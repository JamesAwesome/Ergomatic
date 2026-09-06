// Phase NF (design spec 2026-09-03 §3, "React StrictMode rehearses effect
// setup → cleanup → setup"): an identity-bound MOUNT LEASE for the
// connecting handoff. A hook-effect cleanup cannot itself mean the
// connection attempt died — StrictMode replays it on a live mount — so
// cleanup only QUEUES a microtask release for that attempt ID, and the
// replayed setup reclaims the same lease before the release commits. A real
// unmount has no reclaim, the release commits, and the attempt's staged
// receipt is discarded through `onMountLeaseLost`.
//
// INVARIANTS (not mechanisms, RF27):
//  - a lease is keyed by attempt ID; another ID can never reclaim it;
//  - a release that is reclaimed before its microtask commits is a no-op;
//  - a release that commits fires the loss callback exactly once;
//  - there is no duration threshold anywhere: the boundary is the microtask
//    queue, which is where React drains a StrictMode replay.
//
// LIFETIME: `pendingRelease`/`lost` are module-scoped maps keyed by attempt
// ID. An entry is minted by `release()` and cleared by the committing
// microtask or by `reclaimMountLease`; `onMountLeaseLost` entries are
// cleared when they fire or when `claimMountLease` is called again for the
// same ID (a fresh claim replaces a stale callback). Nothing survives a
// document reload — which is correct: a reloaded document has no staged
// receipt either (`handoffStore.ts`'s own `stagedRetireSet` is in-memory).

import type { ConnectionAttemptId } from "../../domain/monitor/types.js";

const pendingRelease = new Map<ConnectionAttemptId, () => void>();
const lost = new Map<ConnectionAttemptId, () => void>();

/** Registers what to do if `attemptId`'s lease is genuinely lost. */
export function onMountLeaseLost(
  attemptId: ConnectionAttemptId,
  cb: () => void,
): void {
  lost.set(attemptId, cb);
}

/** Cancels a pending release for EXACTLY this ID. Returns whether one was
 *  pending. */
export function reclaimMountLease(attemptId: ConnectionAttemptId): boolean {
  const cancel = pendingRelease.get(attemptId);
  if (cancel === undefined) return false;
  cancel();
  pendingRelease.delete(attemptId);
  return true;
}

export function claimMountLease(attemptId: ConnectionAttemptId): {
  release(): void;
} {
  reclaimMountLease(attemptId);
  return {
    release() {
      let cancelled = false;
      pendingRelease.set(attemptId, () => {
        cancelled = true;
      });
      queueMicrotask(() => {
        if (cancelled) return;
        pendingRelease.delete(attemptId);
        const cb = lost.get(attemptId);
        lost.delete(attemptId);
        cb?.();
      });
    },
  };
}

export function resetMountLeasesForTests(): void {
  pendingRelease.clear();
  lost.clear();
}
