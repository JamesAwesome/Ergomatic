// The replay transport (spec §A2, amendment B1): plays a `ParsedRecording`
// back through the `Transport` interface so `driver.ts` can run, unmodified,
// against a captured session instead of a live radio.
//
// THE BARRIER RULE, and why it is not optional (amendment B1): the real
// driver this engine will eventually drive is strictly ack-gated — it
// purges its ack buffer at the start of every write sequence
// (`driver.ts`), so an ack delivered "on the recorded clock" before the
// driver has actually called `write()` gets silently discarded and
// `program()` hangs forever waiting for an ack that already fired into the
// void. Recorded time (`RecordedEvent.t`) NEVER releases an event on its
// own — it only orders events and drives the virtual clock forward. A `tx`
// event is a BARRIER: playback holds at it until the driver's own
// `transport.write()` call arrives, however long that takes in recorded or
// virtual time. The gap recorded before the very first write is how long
// James took to press a button; nothing under replay reproduces that wait.
//
// Binding semantics (spec §A2 / amendment B1):
//   - rx: advance the virtual clock to the event's `t` (firing any
//     scheduled callbacks whose due time is reached, in due-time order),
//     deliver the bytes to every CURRENT subscriber of that
//     characteristic (M1: per-characteristic fan-out), then drain
//     microtasks (25 iterations — the repo's established drain idiom, cf.
//     `sessionTotals.test.ts`).
//   - tx (the barrier): HOLD until the driver calls `transport.write`.
//     Compare `(char, bytes)` byte-for-byte against the recorded event; on
//     mismatch push a divergence and release the barrier anyway. If no
//     write arrives within `barrierTimeoutMs` REAL ms, push a timeout
//     divergence and release — a wholesale divergence surfaces as a failed
//     zero-divergence assertion, never a Vitest timeout.
//   - scan/connect/subscribe/unsubscribe/disconnect/link-drop: `scan()`
//     resolves the recorded device list; a recorded `link-drop` fires
//     registered `onDisconnect` callbacks with the recorded reason. The
//     driver's own subscribe/connect/disconnect calls are accepted
//     whenever they come — they register callbacks or resolve immediately,
//     they are never barriers.
//   - Writes arriving when no barrier is pending are queued (FIFO) and
//     consumed by the next barrier reached, in order.
//
// The engine itself is agnostic to what a characteristic id or a byte
// sequence MEANS — it schedules opaque `(char, bytes)` events only; nothing
// here decodes CSAFE or knows about the PM5.

import type {
  DiscoveredMonitor,
  Transport,
} from "../../../domain/monitor/types.js";
import {
  fromHexString,
  toHexString,
  type ParsedRecording,
  type RecordedEvent,
} from "./recording";

export interface ReplayClock {
  /** Current virtual-clock reading, in ms — bind as `DriverOptions.now`. */
  now(): number;
  /** Virtual timer: `cb` fires once the virtual clock reaches `now() + ms`
   *  as of this call — bind as `DriverOptions.schedule`. Returns a cancel
   *  function; cancelling after the callback has already fired is a no-op. */
  schedule(cb: () => void, ms: number): () => void;
}

export interface ReplayResult {
  /** One human-readable line per mismatch or timeout, in the order they
   *  occurred. Empty means the recording replayed with no divergence. */
  divergences: string[];
}

export interface ReplayHandle {
  transport: Transport;
  clock: ReplayClock;
  /** Plays the whole recording; resolves at end-of-log. */
  run(): Promise<ReplayResult>;
}

interface QueuedWrite {
  char: string;
  bytes: Uint8Array;
}

interface PendingTimer {
  due: number;
  cb: () => void;
  cancelled: boolean;
}

function isScanEvent(
  e: RecordedEvent,
): e is Extract<RecordedEvent, { kind: "scan" }> {
  return "kind" in e && e.kind === "scan";
}

/** The repo's established drain idiom (cf. `sessionTotals.test.ts`'s
 *  50-iteration drain) — 25 here since only one delivery, not a chain of
 *  driver reactions, needs to settle per rx. */
async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 25; i++) await Promise.resolve();
}

export function createReplayTransport(
  recording: ParsedRecording,
  opts: { barrierTimeoutMs?: number } = {},
): ReplayHandle {
  const barrierTimeoutMs = opts.barrierTimeoutMs ?? 2000;

  // --- virtual clock -------------------------------------------------
  let virtualNow = 0;
  const timers: PendingTimer[] = [];

  function schedule(cb: () => void, ms: number): () => void {
    const timer: PendingTimer = { due: virtualNow + ms, cb, cancelled: false };
    timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  }

  /** Fires every non-cancelled timer due at or before `target`, in due-time
   *  order (earliest first), then sets the clock to `target`. A timer's own
   *  callback observes `now()` as ITS due time, not the final target — the
   *  same distinction a real scheduler makes between "this fired at 3s" and
   *  "the clock is now at 5s because that's where the next event landed". */
  function advanceClock(target: number): void {
    for (;;) {
      let earliest = -1;
      for (let i = 0; i < timers.length; i++) {
        if (timers[i]!.cancelled || timers[i]!.due > target) continue;
        if (earliest === -1 || timers[i]!.due < timers[earliest]!.due) {
          earliest = i;
        }
      }
      if (earliest === -1) break;
      const timer = timers.splice(earliest, 1)[0]!;
      virtualNow = timer.due;
      timer.cb();
    }
    virtualNow = Math.max(virtualNow, target);
  }

  const clock: ReplayClock = {
    now: () => virtualNow,
    schedule,
  };

  // --- subscriber fan-out (M1: per-characteristic) --------------------
  const subscribers = new Map<string, Set<(bytes: Uint8Array) => void>>();

  function subscribe(
    char: string,
    cb: (bytes: Uint8Array) => void,
  ): () => void {
    let set = subscribers.get(char);
    if (!set) {
      set = new Set();
      subscribers.set(char, set);
    }
    set.add(cb);
    return () => {
      subscribers.get(char)?.delete(cb);
    };
  }

  function deliver(char: string, bytes: Uint8Array): void {
    for (const cb of subscribers.get(char) ?? []) cb(bytes);
  }

  // --- disconnect callbacks -------------------------------------------
  const disconnectCbs = new Set<(reason: string) => void>();

  function onDisconnect(cb: (reason: string) => void): () => void {
    disconnectCbs.add(cb);
    return () => {
      disconnectCbs.delete(cb);
    };
  }

  // --- write / barrier machinery ---------------------------------------
  // Writes arriving with no barrier pending queue up FIFO; a pending
  // barrier is resolved by the very next write to arrive, immediately.
  const writeQueue: QueuedWrite[] = [];
  let barrierWaiter: ((w: QueuedWrite) => void) | null = null;

  function write(char: string, bytes: Uint8Array): Promise<void> {
    const w: QueuedWrite = { char, bytes };
    if (barrierWaiter) {
      const waiter = barrierWaiter;
      barrierWaiter = null;
      waiter(w);
    } else {
      writeQueue.push(w);
    }
    return Promise.resolve();
  }

  /** Resolves with the write that satisfies the barrier, or `null` if
   *  `barrierTimeoutMs` REAL ms elapse first. A queued write (one that
   *  arrived before this barrier was reached) is consumed immediately,
   *  with no real-time wait at all. */
  function waitForWrite(): Promise<QueuedWrite | null> {
    const queued = writeQueue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        barrierWaiter = null;
        resolve(null);
      }, barrierTimeoutMs);
      barrierWaiter = (w) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(w);
      };
    });
  }

  // --- scan/connect/disconnect: driver-initiated, accepted whenever ----
  async function scan(): Promise<DiscoveredMonitor[]> {
    const scanEvent = recording.events.find(isScanEvent);
    return scanEvent ? scanEvent.devices : [];
  }

  async function connect(): Promise<void> {
    // Accepted whenever it comes (binding semantics) — never gated on the
    // walk's cursor.
  }

  async function disconnect(): Promise<void> {
    // Caller-initiated; accepted whenever it comes, same as connect().
  }

  const transport: Transport = {
    scan,
    connect,
    write,
    subscribe,
    disconnect,
    onDisconnect,
  };

  async function run(): Promise<ReplayResult> {
    const divergences: string[] = [];

    for (const event of recording.events) {
      advanceClock(event.t);

      if ("dir" in event) {
        if (event.dir === "rx") {
          deliver(event.char, fromHexString(event.hex));
          await drainMicrotasks();
        } else {
          // tx: the barrier. Recorded time never releases this — only the
          // driver's own write() call (or a write already queued) does.
          const w = await waitForWrite();
          if (w === null) {
            divergences.push(`tx#${event.seq} barrier timeout`);
          } else if (
            w.char !== event.char ||
            toHexString(w.bytes) !== event.hex
          ) {
            divergences.push(
              `tx#${event.seq} expected ${event.char} ${event.hex} got ${w.char} ${toHexString(w.bytes)}`,
            );
          }
        }
      } else if (event.kind === "link-drop") {
        for (const cb of [...disconnectCbs]) cb(event.reason);
      }
      // scan/connect/subscribe/unsubscribe/disconnect: driver-initiated —
      // the transport methods above already answer them whenever they're
      // called; the recorded event carries no further action here.
    }

    return { divergences };
  }

  return { transport, clock, run };
}
