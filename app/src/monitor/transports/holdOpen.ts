// THE HOLD-OPEN DECORATOR (Phase RC spec 1, Task 1). A dev instrument
// (Task 3) wants to see what a PM5 sends in the seconds right after a
// workout finishes — but the app's own teardown calls
// `transport.disconnect()` the instant it is done with the monitor, and
// severing the radio then means nothing further from the machine is ever
// seen. This decorator sits at the same seam `liveness.ts` does (below
// `src/monitor/driver.ts`, wrapping any `Transport`) and, once armed,
// intercepts exactly one thing: the NEXT `disconnect()` call resolves
// immediately (so a caller like `bestEffort(driver.disconnect())` never
// hangs) but the REAL disconnect to `inner` is deferred by `HOLD_OPEN_MS`,
// giving the instrument a window to watch notifications keep arriving.
//
// Off by default: nothing changes until `controls.arm()` is called —
// composition sites this task does not touch keep today's disconnect
// behaviour exactly as it is.
//
// SAME IDIOM AS `liveness.ts`: an injected clock (`now`/`schedule`), never
// a bare `Date.now()`/`setTimeout()` — this file's own tests hand-crank a
// clock rather than fake global timers, for the same reasons `liveness.ts`'s
// header gives (a replay's own barrier timeout is a REAL `setTimeout`,
// so faking the global clock over a replay would hang it; this decorator
// has no replay dependency itself, but keeping the same contract means it
// composes into the same harnesses without a second clock-injection
// convention to learn).
//
// ONE-SHOT BY DESIGN: `arm()` fires at most once per instance, ever — not
// just "no-op while already armed/holding" but no-op again even after a
// completed hold. The instrument this exists for is a single push-button
// per session (Task 3), not a rearmable trap; a second workout's teardown
// in the same session disconnects normally.

import type { Transport } from "../../../domain/monitor/types.js";

/** How long a caller-initiated `disconnect()` is held open once armed,
 *  before the real `inner.disconnect()` finally fires on its own — long
 *  enough for a rower to see whatever the PM5 sends unprompted after a
 *  workout ends, short enough that an instrument left armed by accident
 *  doesn't strand the radio connected indefinitely. */
export const HOLD_OPEN_MS = 90_000;

export interface HoldOpenDeps {
  /** Monotonically non-decreasing milliseconds — never absolute time.
   *  Same contract as `LivenessDeps.now`. */
  now(): number;
  /** A schedule-and-cancel pair — same contract as
   *  `LivenessDeps.schedule`/`DriverOptions.schedule` elsewhere in this
   *  codebase. Returns the canceller. */
  schedule(fn: () => void, ms: number): () => void;
  /** Called exactly once per hold window (Task 3 injects a
   *  `sessionStorage` append) with the header line plus every ring entry
   *  captured since `arm()`, newline-joined. */
  stash(text: string): void;
}

export type HoldOpenState = "disarmed" | "armed" | "holding";

export interface HoldOpenControls {
  /** One-shot: arms the instrument for its NEXT `disconnect()` call. A
   *  no-op if already armed/holding, and a no-op again forever once a
   *  hold has completed (released, expired, or ended by the PM5 hanging
   *  up first) — this instance never re-arms. */
  arm(): void;
  /** Ends an in-flight hold right now: cancels the deferred timer, calls
   *  `inner.disconnect()` exactly once, and stashes the ring. Idempotent
   *  — a second call, or a call outside a hold, does nothing. */
  release(): Promise<void>;
  status(): { state: HoldOpenState; msRemaining: number | null };
  /** Entries captured since `arm()`, in arrival order. */
  ring(): string[];
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

const STASH_HEADER = "--- hold-open window (instrument) ---";

export function createHoldOpenTransport(
  inner: Transport,
  deps: HoldOpenDeps,
): { transport: Transport; controls: HoldOpenControls } {
  let state: HoldOpenState = "disarmed";
  let armedOnce = false;
  let armedAtMs = 0;
  let holdStartMs: number | null = null;
  let cancelTimer: (() => void) | null = null;
  let ring: string[] = [];

  function stashRing(): void {
    deps.stash([STASH_HEADER, ...ring].join("\n"));
  }

  /** Synchronously claims the (at most one, ever — see `arm()`) hold for
   *  whichever caller wins the race between release(), expiry, and the
   *  PM5 hanging up first — flips `state` to `"disarmed"` and cancels the
   *  timer BEFORE any `await`, so a second trigger arriving before the
   *  first finishes its own async tail (e.g. `inner.disconnect()`) sees
   *  `state !== "holding"` and backs off instead of double-acting.
   *  Returns `false` when there was no hold to claim — the ONLY caller
   *  that can observe that is a second `release()` (or a `release()`
   *  called outside a hold at all); the scheduled expiry callback below
   *  never needs this check itself, because `deps.schedule`'s own
   *  returned canceller (called here, on every successful claim) is
   *  trusted to prevent a cancelled callback from firing at all — the
   *  same trust `liveness.ts`'s `stopTimer`/`rearmTimer` place in it. */
  function claimHold(): boolean {
    if (state !== "holding") return false;
    cancelTimer?.();
    cancelTimer = null;
    state = "disarmed";
    return true;
  }

  function arm(): void {
    if (armedOnce) return; // one-shot: never re-arms, even post-hold
    armedOnce = true;
    state = "armed";
    armedAtMs = deps.now();
    ring = [];
  }

  async function release(): Promise<void> {
    if (!claimHold()) return;
    try {
      await inner.disconnect();
    } finally {
      // Stash whatever the ring captured regardless of whether the real
      // disconnect resolved or rejected — losing the diagnostic record to
      // a radio error would defeat the whole point of the instrument.
      stashRing();
    }
  }

  function status(): { state: HoldOpenState; msRemaining: number | null } {
    if (state !== "holding" || holdStartMs === null) {
      return { state, msRemaining: null };
    }
    return {
      state,
      msRemaining: Math.max(0, HOLD_OPEN_MS - (deps.now() - holdStartMs)),
    };
  }

  const transport: Transport = {
    ...inner,
    async scan() {
      return inner.scan();
    },
    async connect(id) {
      return inner.connect(id);
    },
    async write(characteristicId, bytes) {
      return inner.write(characteristicId, bytes);
    },
    subscribe(characteristicId, cb) {
      return inner.subscribe(characteristicId, (bytes) => {
        if (state === "armed" || state === "holding") {
          const secondsSinceArm = Math.floor((deps.now() - armedAtMs) / 1000);
          ring.push(`+${secondsSinceArm}s ${characteristicId} ${toHex(bytes)}`);
        }
        cb(bytes);
      });
    },
    async disconnect() {
      if (state === "disarmed") {
        return inner.disconnect();
      }
      if (state === "armed") {
        state = "holding";
        holdStartMs = deps.now();
        cancelTimer = deps.schedule(() => {
          cancelTimer = null;
          state = "disarmed";
          void (async () => {
            try {
              await inner.disconnect();
            } finally {
              stashRing();
            }
          })();
        }, HOLD_OPEN_MS);
        return; // resolves immediately — callers must not hang
      }
      // Already holding: a second disconnect() call while one hold is
      // already in flight. Nothing new to schedule; resolve immediately.
    },
    onDisconnect(cb) {
      return inner.onDisconnect((reason) => {
        // The PM5 hung up first — `inner` is already gone, so there is
        // no `inner.disconnect()` to call here, unlike release()/expiry.
        if (claimHold()) {
          stashRing();
        }
        cb(reason);
      });
    },
  };

  return {
    transport,
    controls: {
      arm,
      release,
      status,
      ring: () => ring.slice(),
    },
  };
}
