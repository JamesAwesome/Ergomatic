// TDD for `holdOpen.ts` (Phase RC spec 1, Task 1) — the deferral decorator
// that lets a dev instrument watch what a PM5 sends AFTER a workout
// finishes, by holding the real radio disconnect open for HOLD_OPEN_MS
// instead of severing it the instant the app is done with the monitor.
//
// Stub `Transport` + hand-cranked clock follow this seam's own established
// idiom (`liveness.test.ts`'s `stubTransport()`/`manualSchedule()`), with
// the clock built exactly as the task brief specifies (`testClock()`).

import { describe, expect, it, vi } from "vitest";
import { LOGGED_WORKOUT_UUID } from "../../../domain/monitor/pm5/uuids.js";
import type { Transport } from "../../../domain/monitor/types.js";
import { createHoldOpenTransport, HOLD_OPEN_MS } from "./holdOpen";

/** A minimal, fully controllable `Transport` — mirrors `liveness.test.ts`'s
 *  own `stubTransport()`: a bare seam to drive `createHoldOpenTransport`
 *  against directly, not a PM5 behavioural model.
 *
 *  `subscribeThrows`, when given, is consulted on every `subscribe()` call
 *  — a truthy return for a characteristic id makes `subscribe()` throw
 *  that value SYNCHRONOUSLY, mirroring `capacitorBle.ts`'s own documented
 *  contract ("`write`/`subscribe` both throw synchronously (via
 *  `serviceFor`) on an unrecognized characteristic id",
 *  `capacitorBle.ts:218-221`) — the real shape a rejecting `subscribe()`
 *  takes on this codebase's native transport, since `Transport.subscribe`
 *  itself returns synchronously and never a `Promise`. */
function stubTransport(opts?: {
  subscribeThrows?: (characteristicId: string) => unknown;
}) {
  const subs = new Map<string, Set<(bytes: Uint8Array) => void>>();
  const disconnectCbs = new Set<(reason: string) => void>();
  let disconnectCalls = 0;

  return {
    get disconnectCalls() {
      return disconnectCalls;
    },
    /** Test-only: deliver a notification as the real radio would. */
    notify(char: string, bytes: Uint8Array): void {
      for (const cb of subs.get(char) ?? []) cb(bytes);
    },
    /** Test-only: simulate the PM5 hanging up on its own. */
    fireOnDisconnect(reason: string): void {
      for (const cb of disconnectCbs) cb(reason);
    },
    transport: {
      async scan() {
        return [{ id: "dev-1", name: "PM5 1" }];
      },
      async connect() {
        // no-op
      },
      async write() {
        // no-op
      },
      subscribe(char, cb) {
        const failure = opts?.subscribeThrows?.(char);
        if (failure !== undefined) throw failure;
        let set = subs.get(char);
        if (!set) {
          set = new Set();
          subs.set(char, set);
        }
        set.add(cb);
        return () => {
          subs.get(char)?.delete(cb);
        };
      },
      async disconnect() {
        disconnectCalls += 1;
      },
      onDisconnect(cb) {
        disconnectCbs.add(cb);
        return () => {
          disconnectCbs.delete(cb);
        };
      },
    } satisfies Transport,
  };
}

/** Verbatim from the task brief — a hand-cranked clock whose `advance()`
 *  both moves time forward and fires any timer whose deadline has passed. */
function testClock() {
  let t = 0;
  const timers: { at: number; fn: () => void; dead: boolean }[] = [];
  return {
    now: () => t,
    schedule(fn: () => void, ms: number) {
      const timer = { at: t + ms, fn, dead: false };
      timers.push(timer);
      return () => {
        timer.dead = true;
      };
    },
    advance(ms: number) {
      t += ms;
      for (const x of timers)
        if (!x.dead && x.at <= t) {
          x.dead = true;
          x.fn();
        }
    },
  };
}

const CHAR = "ce060030-43e5-11e4-916c-0800200c9a66"; // 0x0031, arbitrary for this suite

/** A DECOUPLED clock/schedule pair — mirrors `liveness.test.ts`'s own
 *  `manualClock()`/`manualSchedule()` idiom, unlike `testClock()` above
 *  (whose `advance()` always fires any timer it passes). Needed for
 *  exactly one test below: proving `status().msRemaining` never goes
 *  negative even if `now()` is read strictly after `HOLD_OPEN_MS` has
 *  elapsed but BEFORE the real scheduler has gotten around to firing the
 *  expiry callback — a real, if narrow, production possibility
 *  (`setTimeout` granularity) that `testClock()`'s coupled `advance()`
 *  cannot express, since it always fires a due timer in the same call
 *  that moves time past its deadline. */
function manualClock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    set(ms: number): void {
      t = ms;
    },
  };
}

function manualSchedule() {
  const calls: { fire: () => void; cancelled: boolean }[] = [];
  return {
    schedule: (fn: () => void): (() => void) => {
      const call = { fire: fn, cancelled: false };
      calls.push(call);
      return () => {
        call.cancelled = true;
      };
    },
  };
}

describe("createHoldOpenTransport: disarmed pass-through", () => {
  it("transport.disconnect() passes straight through to inner.disconnect() while disarmed", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });

    await transport.disconnect();

    expect(stub.disconnectCalls).toBe(1);
    expect(controls.status()).toStrictEqual({
      state: "disarmed",
      msRemaining: null,
    });
  });
});

describe("createHoldOpenTransport: armed disconnect defers", () => {
  it("resolves IMMEDIATELY, moves state to holding, and does not call inner.disconnect() yet", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });
    controls.arm();

    // A caller like `bestEffort(driver.disconnect())` must not hang on this.
    await expect(transport.disconnect()).resolves.toBeUndefined();

    expect(stub.disconnectCalls).toBe(0);
    expect(controls.status().state).toBe("holding");
  });

  it("expiry at HOLD_OPEN_MS calls inner.disconnect() and stashes exactly once", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const stash = vi.fn();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash,
    });
    controls.arm();
    await transport.disconnect();

    clock.advance(HOLD_OPEN_MS);
    await Promise.resolve(); // let the expiry's async disconnect+stash tail settle

    expect(stub.disconnectCalls).toBe(1);
    expect(stash).toHaveBeenCalledOnce();
    expect(controls.status()).toStrictEqual({
      state: "disarmed",
      msRemaining: null,
    });
  });

  it("a second disconnect() call while already holding is a no-op — resolves immediately, does not reset the hold's own deadline, and does not double-disconnect", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });
    controls.arm();
    await transport.disconnect(); // -> holding, real timer scheduled for T+HOLD_OPEN_MS

    clock.advance(1_000);
    await expect(transport.disconnect()).resolves.toBeUndefined();

    expect(stub.disconnectCalls).toBe(0);
    // THE LOAD-BEARING ASSERTION: a buggy re-entry into the scheduling
    // branch here would reset `holdStartMs` to THIS call's time (t=1000),
    // reporting a fresh 90000ms remaining. It must instead still be
    // anchored to the FIRST call's own deadline (t=0 + HOLD_OPEN_MS), so
    // only HOLD_OPEN_MS - 1000 remains. A `disconnectCalls` count alone
    // cannot catch a redundant re-schedule here: whichever of two timers
    // targeting the same underlying hold fires first ends up cancelling
    // the other through the shared `cancelTimer` slot regardless of which
    // was "real" — msRemaining is the one signal a stray reschedule can't
    // hide from.
    expect(controls.status().msRemaining).toBe(HOLD_OPEN_MS - 1_000);

    clock.advance(HOLD_OPEN_MS - 1_000); // reaches the FIRST timer's own deadline
    expect(stub.disconnectCalls).toBe(1);
  });

  it("does not expire early — advancing to just short of HOLD_OPEN_MS does not call inner.disconnect()", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });
    controls.arm();
    await transport.disconnect();

    clock.advance(HOLD_OPEN_MS - 1);

    expect(stub.disconnectCalls).toBe(0);
    expect(controls.status().state).toBe("holding");
  });
});

describe("createHoldOpenTransport: release() during hold", () => {
  it("cancels the timer, calls inner.disconnect() once, and stashes", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const stash = vi.fn();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash,
    });
    controls.arm();
    await transport.disconnect();

    await controls.release();

    expect(stub.disconnectCalls).toBe(1);
    expect(stash).toHaveBeenCalledOnce();
    expect(controls.status()).toStrictEqual({
      state: "disarmed",
      msRemaining: null,
    });
  });

  it("a second release() does not call inner.disconnect() or stash again", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const stash = vi.fn();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash,
    });
    controls.arm();
    await transport.disconnect();
    await controls.release();

    await controls.release();

    expect(stub.disconnectCalls).toBe(1);
    expect(stash).toHaveBeenCalledOnce();
  });

  it("expiry after release() does not fire — the timer was cancelled, so advancing past HOLD_OPEN_MS is a no-op", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const stash = vi.fn();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash,
    });
    controls.arm();
    await transport.disconnect();
    await controls.release();

    clock.advance(HOLD_OPEN_MS);

    expect(stub.disconnectCalls).toBe(1);
    expect(stash).toHaveBeenCalledOnce();
  });
});

describe("createHoldOpenTransport: notification tee", () => {
  it("tees every notification delivered while armed or holding into the ring, formatted '+<seconds since arm>s <char> <hex>'", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });
    const cb = vi.fn();
    transport.subscribe(CHAR, cb);
    controls.arm();

    stub.notify(CHAR, new Uint8Array([0xde, 0xad]));
    expect(controls.ring()).toStrictEqual([`+0s ${CHAR} de ad`]);

    await transport.disconnect(); // -> holding
    clock.advance(3_000);
    stub.notify(CHAR, new Uint8Array([0xbe, 0xef]));

    expect(controls.ring()).toStrictEqual([
      `+0s ${CHAR} de ad`,
      `+3s ${CHAR} be ef`,
    ]);
    // The wrapped callback still receives every notification unchanged.
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("rounds seconds-since-arm DOWN (floor), not up — 2.9s since arm reads '+2s', not '+3s'", () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });
    transport.subscribe(CHAR, () => {});
    controls.arm();

    clock.advance(2_900); // floor(2.9) = 2, ceil(2.9) = 3 — the two disagree
    stub.notify(CHAR, new Uint8Array([0x01]));

    expect(controls.ring()).toStrictEqual([`+2s ${CHAR} 01`]);
  });

  it("disarmed notifications are NOT recorded — the ring stops growing once release() returns to disarmed", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });
    transport.subscribe(CHAR, () => {});

    // Before arm() at all — disarmed from the start.
    stub.notify(CHAR, new Uint8Array([0x01]));
    expect(controls.ring()).toStrictEqual([]);

    controls.arm();
    await transport.disconnect(); // -> holding
    await controls.release(); // -> disarmed again
    const ringAfterRelease = controls.ring();

    stub.notify(CHAR, new Uint8Array([0x02]));

    expect(controls.ring()).toStrictEqual(ringAfterRelease);
  });
});

describe("createHoldOpenTransport: inner.onDisconnect during hold", () => {
  it("the PM5 hanging up first cancels the timer, moves to disarmed, and stashes what was captured — without an extra inner.disconnect() call", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const stash = vi.fn();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash,
    });
    const seen = vi.fn();
    transport.onDisconnect(seen);
    transport.subscribe(CHAR, () => {});
    controls.arm();
    await transport.disconnect(); // -> holding
    stub.notify(CHAR, new Uint8Array([0xaa]));

    stub.fireOnDisconnect("radio-dropped");

    expect(stub.disconnectCalls).toBe(0); // we never call inner.disconnect() ourselves here
    expect(stash).toHaveBeenCalledOnce();
    expect(controls.status()).toStrictEqual({
      state: "disarmed",
      msRemaining: null,
    });
    expect(seen).toHaveBeenCalledExactlyOnceWith("radio-dropped");

    // The now-cancelled timer must not also fire later.
    clock.advance(HOLD_OPEN_MS);
    expect(stub.disconnectCalls).toBe(0);
    expect(stash).toHaveBeenCalledOnce();
  });
});

describe("createHoldOpenTransport: inner.onDisconnect outside a hold", () => {
  it("firing while merely armed (disconnect() never called) forwards the reason but does not stash — there is no hold to claim", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const stash = vi.fn();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash,
    });
    const seen = vi.fn();
    transport.onDisconnect(seen);
    controls.arm();

    stub.fireOnDisconnect("radio-dropped");

    expect(seen).toHaveBeenCalledExactlyOnceWith("radio-dropped");
    expect(stash).not.toHaveBeenCalled();
    expect(controls.status().state).toBe("armed"); // untouched by this path
  });

  it("firing while disarmed (never armed at all) forwards the reason and does not stash", () => {
    const stub = stubTransport();
    const clock = testClock();
    const stash = vi.fn();
    const { transport } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash,
    });
    const seen = vi.fn();
    transport.onDisconnect(seen);

    stub.fireOnDisconnect("radio-dropped");

    expect(seen).toHaveBeenCalledExactlyOnceWith("radio-dropped");
    expect(stash).not.toHaveBeenCalled();
  });
});

describe("createHoldOpenTransport: stash(text) format and once-per-window guarantee", () => {
  it("stashes a header line followed by the ring entries, joined by newlines", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const stash = vi.fn();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash,
    });
    transport.subscribe(CHAR, () => {});
    controls.arm();
    stub.notify(CHAR, new Uint8Array([0x01]));
    await transport.disconnect();
    clock.advance(1_000);
    stub.notify(CHAR, new Uint8Array([0x02]));

    await controls.release();

    expect(stash).toHaveBeenCalledExactlyOnceWith(
      [
        "--- hold-open window (instrument) ---",
        `+0s ${CHAR} 01`,
        `+1s ${CHAR} 02`,
      ].join("\n"),
    );
  });
});

describe("createHoldOpenTransport: status() msRemaining", () => {
  it("counts down under advance() and returns null once the hold ends", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });
    controls.arm();
    await transport.disconnect();
    expect(controls.status().msRemaining).toBe(HOLD_OPEN_MS);

    clock.advance(30_000);
    expect(controls.status().msRemaining).toBe(HOLD_OPEN_MS - 30_000);

    clock.advance(HOLD_OPEN_MS - 30_000); // reaches HOLD_OPEN_MS total, fires expiry
    expect(controls.status().msRemaining).toBeNull();
  });

  it("never goes negative — reading status() after HOLD_OPEN_MS has elapsed but before the (decoupled) scheduler has fired the expiry callback still clamps to 0", async () => {
    const stub = stubTransport();
    const clock = manualClock();
    const timer = manualSchedule();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: timer.schedule,
      stash: vi.fn(),
    });
    controls.arm();
    await transport.disconnect(); // -> holding, real timer NOT fired by this clock

    clock.set(HOLD_OPEN_MS + 5_000); // well past expiry, but the timer hasn't fired

    expect(controls.status()).toStrictEqual({
      state: "holding",
      msRemaining: 0,
    });
  });
});

describe("createHoldOpenTransport: arm() is one-shot", () => {
  it("a second arm() call while already armed/holding is a no-op — it does not reset the ring or the arm clock", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });
    transport.subscribe(CHAR, () => {});
    controls.arm();
    clock.advance(5_000);
    stub.notify(CHAR, new Uint8Array([0x01])); // +5s since the FIRST arm()

    controls.arm(); // second call — must be a no-op

    expect(controls.ring()).toStrictEqual([`+5s ${CHAR} 01`]);
  });

  it("arm() after a completed hold does nothing — the transport stays disarmed", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });
    controls.arm();
    await transport.disconnect();
    clock.advance(HOLD_OPEN_MS); // completes the hold, back to disarmed
    expect(controls.status().state).toBe("disarmed");

    controls.arm(); // must be a no-op — one-shot instrument, spent

    expect(controls.status().state).toBe("disarmed");
    // Proof it's genuinely disarmed, not re-armed: a fresh disconnect()
    // passes straight through instead of deferring again.
    await transport.disconnect();
    expect(stub.disconnectCalls).toBe(2); // once from the completed hold, once just now
  });
});

// Phase RC spec 1, Task 2 (design spec §3): the instrument's own subscribe
// to 0x003F (the "logged workout" characteristic) — armed alongside the
// hold itself, not the driver's shared subscribe list, so it never touches
// the native arm. "Absent on this firmware" (a recorded `subscribe-failed`)
// must read differently from "present but silent" (no entry at all).
describe("createHoldOpenTransport: 0x003F subscribed at arm", () => {
  it("arm() subscribes LOGGED_WORKOUT_UUID on the inner transport", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const subscribeSpy = vi.spyOn(stub.transport, "subscribe");
    const { controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });

    controls.arm();
    await Promise.resolve(); // subscribe() is deferred one microtask — see arm()'s own comment

    expect(subscribeSpy).toHaveBeenCalledWith(
      LOGGED_WORKOUT_UUID,
      expect.any(Function),
    );
  });

  it("0x003F notifications tee into the ring exactly like any other subscribed characteristic", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const { controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });

    controls.arm();
    await Promise.resolve(); // let the deferred subscribe register first
    clock.advance(4_000);
    stub.notify(LOGGED_WORKOUT_UUID, new Uint8Array([0xfa, 0xce]));

    expect(controls.ring()).toStrictEqual([`+4s ${LOGGED_WORKOUT_UUID} fa ce`]);
  });

  it("a rejecting inner subscribe records a subscribe-failed ring entry naming the error, and does NOT reject arm() or kill the hold", async () => {
    const failure = new Error("no such characteristic");
    failure.name = "NotFoundError";
    const stub = stubTransport({
      subscribeThrows: (char) =>
        char === LOGGED_WORKOUT_UUID ? failure : undefined,
    });
    const clock = testClock();
    const { transport, controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });

    expect(() => controls.arm()).not.toThrow();
    // Let the deferred subscribe-and-catch tail settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(controls.ring()).toStrictEqual([
      "+0s 0x003f subscribe-failed NotFoundError",
    ]);

    // Does not kill the hold: disconnect() still defers normally afterward.
    await expect(transport.disconnect()).resolves.toBeUndefined();
    expect(stub.disconnectCalls).toBe(0);
    expect(controls.status().state).toBe("holding");
  });

  it("a rejecting inner subscribe with a non-Error failure records String(e), not a crash", async () => {
    const stub = stubTransport({
      subscribeThrows: (char) =>
        char === LOGGED_WORKOUT_UUID ? "plain-string-failure" : undefined,
    });
    const clock = testClock();
    const { controls } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });

    controls.arm();
    await Promise.resolve();
    await Promise.resolve();

    expect(controls.ring()).toStrictEqual([
      "+0s 0x003f subscribe-failed plain-string-failure",
    ]);
  });
});

describe("createHoldOpenTransport: pass-through fidelity", () => {
  it("scan()/connect() resolve with exactly what inner resolves with", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });

    const devices = await transport.scan();
    expect(devices).toStrictEqual([{ id: "dev-1", name: "PM5 1" }]);
    await expect(transport.connect("dev-1")).resolves.toBeUndefined();
  });

  it("write() forwards the exact characteristic id and bytes to inner, unchanged", async () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });
    const writeSpy = vi.spyOn(stub.transport, "write");
    const bytes = new Uint8Array([0xf1, 0x76, 0x04]);

    await transport.write("some-char", bytes);

    expect(writeSpy).toHaveBeenCalledExactlyOnceWith("some-char", bytes);
  });

  it("subscribe()'s returned unsubscribe function stops delivery through the decorator too", () => {
    const stub = stubTransport();
    const clock = testClock();
    const { transport } = createHoldOpenTransport(stub.transport, {
      now: clock.now,
      schedule: clock.schedule,
      stash: vi.fn(),
    });
    const cb = vi.fn();
    const unsubscribe = transport.subscribe(CHAR, cb);
    stub.notify(CHAR, new Uint8Array());
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();
    stub.notify(CHAR, new Uint8Array());

    expect(cb).toHaveBeenCalledTimes(1);
  });
});
