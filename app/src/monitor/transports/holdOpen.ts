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

import { LOGGED_WORKOUT_UUID } from "../../../domain/monitor/pm5/uuids.js";
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
  /** Called exactly once per hold window (Task 3 injects a `sessionStorage`
   *  append) with the header line plus every ring entry captured since
   *  `arm()`, IN ORDER — as an ARRAY, never pre-joined into a single
   *  string (final-review I1: the caller's own stash key holds
   *  `exportLog()` JSON, an array of `MonitorLogEntry` objects; joining
   *  these into one text blob and appending it corrupted that JSON for
   *  every downstream reader, including the in-app diagnostic this ring
   *  exists to feed and the hardware-walk tooling that ingests the same
   *  key). This module stays agnostic of `MonitorLogEntry`'s shape on
   *  purpose — the caller decides how each line becomes a stored entry. */
  stash(lines: string[]): void;
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

// KEPT VERBATIM as a string literal (final-review, "Production absence"
// table): `scripts/dist-grep.sh` greps a production `dist/client` build for
// this exact text as its own proof that `holdOpen.ts` never ships in a real
// deploy — changing or removing it would silently defang that needle.
const STASH_HEADER = "--- hold-open window (instrument) ---";

/** C1 fix (final-review): does `t` carry the degraded-characteristic
 *  structural extension `webBluetooth.ts` now exposes (same idiom as
 *  `useMonitorSession.ts`'s own `hasCharacteristicDegraded` and
 *  `capacitorBle.ts`'s pre-existing `onCharacteristicDegraded`)? `inner`
 *  here is always `recording.ts`'s tap, which forwards it through from
 *  whichever real transport it wraps via its own `...inner` spread — a
 *  bare test `Transport` typically does not implement it. */
function hasCharacteristicDegraded(t: Transport): t is Transport & {
  onCharacteristicDegraded(
    cb: (characteristicId: string, message: string) => void,
  ): () => void;
} {
  return (
    typeof (t as { onCharacteristicDegraded?: unknown })
      .onCharacteristicDegraded === "function"
  );
}

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
    deps.stash([STASH_HEADER, ...ring]);
  }

  function sinceArm(): number {
    return Math.floor((deps.now() - armedAtMs) / 1000);
  }

  function ringPush(entry: string): void {
    ring.push(entry);
  }

  /** Builds a notification callback that records into the ring — shared
   *  by every characteristic's `subscribe()`, so 0x003F (below) tees
   *  identically to whatever the caller subscribed above it, rather than
   *  duplicating this gate a second time. */
  function tee(characteristicId: string): (bytes: Uint8Array) => void {
    return (bytes) => {
      if (state === "armed" || state === "holding") {
        ringPush(`+${sinceArm()}s ${characteristicId} ${toHex(bytes)}`);
      }
    };
  }

  /** Synchronously claims the (at most one, ever — see `arm()`) hold for
   *  whichever caller wins the race between release(), expiry, and the
   *  PM5 hanging up first — flips `state` to `"disarmed"` and cancels the
   *  timer BEFORE any `await`, so a second trigger arriving before the
   *  first finishes its own async tail (e.g. `inner.disconnect()`) sees
   *  `state !== "holding"` and backs off instead of double-acting. THE
   *  ONE GATE all three triggers (release(), the scheduled expiry
   *  callback, and the onDisconnect handler) share — none of them
   *  re-implements this body inline, so a future edit here applies to
   *  all three automatically. Returns `false` when there was no hold to
   *  claim; the expiry callback below calls this unconditionally and
   *  ignores the return, because `deps.schedule`'s own returned
   *  canceller (called here, on every successful claim) is trusted to
   *  prevent a cancelled callback from firing at all — the same trust
   *  `liveness.ts`'s `stopTimer`/`rearmTimer` place in it — so a `false`
   *  return there would indicate the trust was misplaced, not a normal
   *  outcome to branch on. */
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
    // C1 fix (final-review): a POSITIVE trace that arm() actually asked
    // for the subscription — pushed synchronously, unconditional of
    // whatever the deferred call below turns out to do. Before this, a
    // successful-but-silent subscribe and a subscribe that never
    // happened at all (a code bug, this instrument never wired up) left
    // an identical empty ring; now the ring's very first line proves the
    // request was made, and the QUESTION W4 exists to answer — "did the
    // PM5 send anything back?" — is legible from whatever comes after it.
    ringPush(`+${sinceArm()}s 0x003f subscribe-issued`);
    // THE INSTRUMENT's OWN SUBSCRIBE (Phase RC spec 1 §3). STALE AS OF
    // THE STORAGE-SPINE SPEC's PR 1 (final-review LOW-1, corrected here):
    // this comment used to say 0x003F is "not on the driver's shared
    // subscribe list (adding it there would put it on the native arm
    // too; this decorator is dev/web-only)" — that PR did exactly that
    // (`driver.ts`'s own `t.subscribe(LOGGED_WORKOUT_UUID, ...)`, plus
    // `capacitorBle.ts`'s `SERVICE_OF` map gaining the entry the native
    // arm needs), so 0x003F is now on BOTH arms via the driver's own
    // subscription, independent of this instrument entirely. No
    // functional collision: `capacitorBle.ts` fans out per characteristic
    // (`subscribers: Map<string, Set<...>>`), `webBluetooth.ts` registers
    // independent listeners, and the driver never unsubscribes its own
    // transport characteristics (only `t.disconnect()`), so a SECOND,
    // instrument-only subscribe here is a harmless duplicate, not a
    // conflict — it stays, because `arm()` is still the only door that
    // opens a window BEYOND the driver's own teardown (the 90s hold this
    // whole decorator exists for). The unsubscribe handle is deliberately
    // dropped: the link is about to die by design, same as every other
    // characteristic this decorator never calls unsubscribe() on itself.
    //
    // Deferred one microtask (`Promise.resolve().then(...)`) rather than
    // `Promise.resolve(inner.subscribe(...))` verbatim: `Transport.
    // subscribe` returns `() => void` SYNCHRONOUSLY per its own type
    // (domain/monitor/types.ts) and never a Promise, and
    // `capacitorBle.ts` documents that its `subscribe()` "throw[s]
    // synchronously (via `serviceFor`) on an unrecognized characteristic
    // id" (capacitorBle.ts:218-221) — exactly the shape a firmware
    // lacking 0x003F, or a `SERVICE_OF` map missing an entry for it,
    // produces on the native transport this decorator can be composed
    // over (it never does — this decorator is dev/web-only, per its own
    // header — but the safety net is cheap to keep). Deferring the call
    // into the `.then()` turns that throw into a rejection this
    // `.catch()` actually observes.
    //
    // **C1 fix, the load-bearing half (final-review): this `.catch()`
    // alone is NOT the fix.** `webBluetooth.subscribe` — the only arm
    // this instrument ever actually runs on — never throws synchronously
    // AND never rejects a Promise either: its GATT lookup runs inside a
    // `void`ed internal `.then()` chain with no attached `.catch()`
    // (`webBluetooth.ts`'s own `subscribe()`), so a firmware without
    // 0x003F on the web arm produced no ring entry at all before this
    // fix — "absent" and "silent" read identically, exactly the gap W4
    // exists to close. `webBluetooth.ts` now routes that internal
    // rejection through `onCharacteristicDegraded`, the same structural
    // `Transport` extension `capacitorBle.ts` already exposes for the
    // native arm — wired below.
    Promise.resolve()
      .then(() =>
        inner.subscribe(LOGGED_WORKOUT_UUID, tee(LOGGED_WORKOUT_UUID)),
      )
      .catch((e: unknown) => {
        ringPush(
          `+${sinceArm()}s 0x003f subscribe-failed ${e instanceof Error ? e.name : String(e)}`,
        );
      });
    // C1 fix, continued: the web arm's OWN failure seam. `inner` here is
    // `recording.ts`'s tap, which forwards this structural extension
    // through unchanged from whichever real transport it wraps (that
    // file's own `...inner` spread, matching `liveness.ts`'s established
    // idiom) — so when `inner` is ultimately `webBluetooth.ts`'s real
    // transport, this reaches its `onCharacteristicDegraded` and hears
    // the async rejection the `.catch()` above structurally cannot. Only
    // 0x003F's own failure is recorded here — `useMonitorSession.ts`
    // separately registers its own listener (its `hasCharacteristicDegraded`
    // wiring) for every OTHER characteristic's degradation, and the two
    // do not collide: `webBluetooth.ts`'s implementation fans out to every
    // registered listener rather than the single-slot pattern
    // `capacitorBle.ts` uses, specifically so this instrument's own
    // registration can never silently steal the driver's.
    if (hasCharacteristicDegraded(inner)) {
      inner.onCharacteristicDegraded((characteristicId, message) => {
        if (
          characteristicId === LOGGED_WORKOUT_UUID &&
          (state === "armed" || state === "holding")
        ) {
          ringPush(`+${sinceArm()}s 0x003f subscribe-failed ${message}`);
        }
      });
    }
  }

  async function release(): Promise<void> {
    if (!claimHold()) return;
    // I4 fix (final-review): one of the three terminal-path lifecycle
    // entries the report's own "three one-line ringPush calls" fix names
    // — without it, a 90s window that captured no notifications was
    // indistinguishable from one whose release/expiry/link-drop never
    // ran at all, and exit criterion 5's negative ("the PM5 genuinely
    // sent nothing") had no way to prove the window actually closed.
    ringPush(`+${sinceArm()}s hold-released`);
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
      const teeFor = tee(characteristicId);
      return inner.subscribe(characteristicId, (bytes) => {
        teeFor(bytes);
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
        ringPush(`+${sinceArm()}s hold-start`);
        cancelTimer = deps.schedule(() => {
          claimHold(); // always succeeds here — see claimHold()'s own doc
          // I4 fix: the second of the three terminal-path lifecycle
          // entries — see release()'s own comment on why an empty ring
          // cannot otherwise tell "genuinely silent" from "never ran".
          ringPush(`+${sinceArm()}s hold-expired`);
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
        // I5 fix (final-review): a link drop while merely ARMED (not yet
        // holding — no `disconnect()` has been called yet) used to leave
        // `state` at `"armed"` forever, because `claimHold()` only claims
        // FROM `"holding"`. The NEXT `disconnect()` call — the teardown
        // that follows this very drop — would then transition
        // armed→holding on a transport that is already dead:
        // `status()` would report a counting-down `msRemaining` for a
        // radio that's gone, and the ring would only stash 90s later for
        // a window that can record nothing. Treated here as a terminal
        // path in its own right, exactly like the three `claimHold()`
        // triggers: disarm immediately, ring the event, stash what
        // there is (typically nothing beyond "armed"/"subscribe-issued").
        if (state === "armed") {
          state = "disarmed";
          ringPush(`+${sinceArm()}s link-drop-while-armed`);
          stashRing();
        } else if (claimHold()) {
          // The PM5 hung up first while HOLDING — `inner` is already
          // gone, so there is no `inner.disconnect()` to call here,
          // unlike release()/expiry. I4 fix: the third of the three
          // terminal-path lifecycle entries.
          ringPush(`+${sinceArm()}s link-drop-during-hold`);
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
