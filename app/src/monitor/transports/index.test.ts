import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKOUTSTATE_WAITTOBEGIN } from "../../../domain/monitor/pm5/parse.js";
import {
  GENERAL_STATUS_UUID,
  SAMPLE_RATE_UUID,
} from "../../../domain/monitor/pm5/uuids.js";
import type { WorkoutProgram } from "../../../domain/monitor/program.js";
import type { Transport } from "../../../domain/monitor/types.js";
import { autoTicking, resolveDefaultTransport } from "./index";

// A minimal one-interval program — this file's own tests are about
// TRANSPORT SELECTION and the auto-tick wrapper, never about the fake's
// byte-level behaviour (that's `fake.test.ts`'s job), so the program only
// needs to be well-formed enough for `createFakeTransport` to accept it.
const PROGRAM: WorkoutProgram = {
  intervals: [
    {
      kind: "distance",
      value: 500,
      targetSplit: null,
      displaySpm: null,
      restSeconds: 0,
    },
  ],
};

describe("resolveDefaultTransport", () => {
  afterEach(() => {
    delete window.__pm5FakeScript__;
    delete window.__pm5FakeControls__;
  });

  it("returns null when there is no fake script and no navigator.bluetooth (jsdom's own baseline — no Web Bluetooth API exists here)", async () => {
    expect(window.__pm5FakeScript__).toBeUndefined();
    const transport = await resolveDefaultTransport();
    expect(transport).toBeNull();
  });

  it("builds a fake transport when window.__pm5FakeScript__ is set — the seam this task exists for", async () => {
    window.__pm5FakeScript__ = {
      program: PROGRAM,
      deviceName: "PM5 (e2e fake)",
    };
    const transport = await resolveDefaultTransport();
    expect(transport).not.toBeNull();
    const found = await transport!.scan();
    expect(found).toStrictEqual([{ id: "fake-pm5", name: "PM5 (e2e fake)" }]);
  });

  it("never builds a fake transport when no script is injected, even across repeated calls", async () => {
    expect(await resolveDefaultTransport()).toBeNull();
    expect(await resolveDefaultTransport()).toBeNull();
  });

  it("exposes the raw FakeControls on window.__pm5FakeControls__ — the throttle-immune escape hatch a scripted e2e walk pumps directly", async () => {
    expect(window.__pm5FakeControls__).toBeUndefined();
    window.__pm5FakeScript__ = {
      program: PROGRAM,
      events: [
        {
          atMs: 500,
          kind: "status",
          workoutState: WORKOUTSTATE_WAITTOBEGIN,
          elapsedSeconds: 0,
          distanceMeters: 0,
          spm: 0,
          currentSplit: 0,
          heartRateBpm: null,
          programIntervalIndex: 0,
        },
      ],
    };
    const transport = await resolveDefaultTransport();
    expect(window.__pm5FakeControls__).toBeDefined();
    // It is the SAME instance the wrapped transport forwards to — ticking
    // it here, from OUTSIDE the wrapped transport a caller normally holds,
    // is observable through that transport's own `subscribe()`, proving
    // this is not a second, disconnected fake.
    const notified = vi.fn();
    transport!.subscribe(GENERAL_STATUS_UUID, notified);
    window.__pm5FakeControls__!.tick(500);
    expect(notified).toHaveBeenCalled();
  });

  it("self-ticks the injected fake in real time, delivering scripted frames with no caller-driven tick()", async () => {
    vi.useFakeTimers();
    try {
      window.__pm5FakeScript__ = {
        program: PROGRAM,
        events: [
          {
            atMs: 200,
            kind: "status",
            workoutState: WORKOUTSTATE_WAITTOBEGIN,
            elapsedSeconds: 0,
            distanceMeters: 0,
            spm: 0,
            currentSplit: 0,
            heartRateBpm: null,
            programIntervalIndex: 0,
          },
        ],
      };
      const transport = await resolveDefaultTransport();
      const notified = vi.fn();
      transport!.subscribe(GENERAL_STATUS_UUID, notified);
      // Nothing has ticked yet — the wrapper's Transport-only return type
      // exposes no `tick()` of its own; only the real interval drives it.
      expect(notified).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(500);
      expect(notified).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("forwards connect()/write() straight through to the wrapped fake — the wrapper adds only the clock and the stop-on-hangup wiring", async () => {
    window.__pm5FakeScript__ = { program: PROGRAM };
    const transport = await resolveDefaultTransport();
    await transport!.connect("fake-pm5");
    // A write to the sample-rate characteristic is the fake's own
    // unconditional no-op accept (`fake.ts`'s own `write()`, checked before
    // any phase-based assertion) — the shortest real write this wrapper can
    // forward without also asserting `fake.ts`'s own byte-level contract,
    // which is `fake.test.ts`'s job, not this wrapper's.
    await expect(
      transport!.write(SAMPLE_RATE_UUID, new Uint8Array(1)),
    ).resolves.toBeUndefined();
  });

  it("applies delayWritesMs to the wrapped fake at construction — connect() does not settle until it elapses", async () => {
    vi.useFakeTimers();
    try {
      window.__pm5FakeScript__ = { program: PROGRAM, delayWritesMs: 400 };
      const transport = await resolveDefaultTransport();
      let settled = false;
      void transport!.connect("fake-pm5").then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(399);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("omitted delayWritesMs leaves the fake's own instant default untouched", async () => {
    window.__pm5FakeScript__ = { program: PROGRAM };
    const transport = await resolveDefaultTransport();
    let settled = false;
    void transport!.connect("fake-pm5").then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(true);
  });

  it("stops ticking once disconnect() is called — no timer left running against a page that's hanging up", async () => {
    vi.useFakeTimers();
    try {
      window.__pm5FakeScript__ = { program: PROGRAM };
      const transport = await resolveDefaultTransport();
      const notified = vi.fn();
      transport!.subscribe(GENERAL_STATUS_UUID, notified);
      await transport!.disconnect();
      notified.mockClear();
      await vi.advanceTimersByTimeAsync(5000);
      // The clearest observable proof that the INTERVAL itself is gone
      // (not merely that this particular script has nothing left to say)
      // is `vi.getTimerCount()`.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// autoTicking — driven directly against a hand-built stub, since
// `resolveDefaultTransport`'s own `Transport`-only return type has no way to
// fire a wrapped fake's OWN `onDisconnect` callback from outside (there is
// no second handle onto the instance it built internally).
// ---------------------------------------------------------------------------

/** A `Transport & { tick }` stub with an `injectDisconnect()` escape hatch
 *  the real `fake.ts` deliberately does not expose on its `Transport` half —
 *  exactly the shape `autoTicking` itself is typed against, so this test
 *  exercises the wrapper's own contract without needing a real fake at all. */
function stubFake(): Transport & {
  tick(ms: number): void;
  injectDisconnect(): void;
} {
  let disconnectCb: ((reason: string) => void) | null = null;
  return {
    scan: () => Promise.resolve([]),
    connect: () => Promise.resolve(),
    write: () => Promise.resolve(),
    subscribe: () => () => undefined,
    disconnect: () => Promise.resolve(),
    onDisconnect: (cb) => {
      disconnectCb = cb;
      return () => {
        if (disconnectCb === cb) disconnectCb = null;
      };
    },
    tick: () => undefined,
    injectDisconnect: () => disconnectCb?.("stub: injected disconnect"),
  };
}

describe("autoTicking", () => {
  it("stops the clock and forwards the reason when the WRAPPED fake reports its own unexpected disconnect", () => {
    vi.useFakeTimers();
    try {
      const fake = stubFake();
      const wrapped = autoTicking(fake);
      expect(vi.getTimerCount()).toBe(1);
      const onDisconnect = vi.fn();
      wrapped.onDisconnect(onDisconnect);
      fake.injectDisconnect();
      expect(onDisconnect).toHaveBeenCalledWith("stub: injected disconnect");
      // THE MUTATION THIS PIN KILLS: dropping the `stop()` call inside
      // `onDisconnect`'s wrapper (forwarding the reason but leaving the
      // interval running) would still pass the assertion above — only the
      // timer count tells the two apart.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a caller-initiated disconnect() also stops the clock, independent of the fake's own callback", async () => {
    vi.useFakeTimers();
    try {
      const fake = stubFake();
      const wrapped = autoTicking(fake);
      expect(vi.getTimerCount()).toBe(1);
      await wrapped.disconnect();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop() is idempotent — a caller-initiated disconnect() followed by the fake's own late callback clears no SECOND timer", async () => {
    vi.useFakeTimers();
    try {
      const fake = stubFake();
      const wrapped = autoTicking(fake);
      await wrapped.disconnect();
      expect(vi.getTimerCount()).toBe(0);
      // A late `injectDisconnect()` after the caller already hung up — the
      // real fake can still fire this (a disconnect racing the app's own
      // `disconnect()` call) — must not throw calling `clearInterval` on an
      // already-cleared timer, and must still forward the reason.
      const onDisconnect = vi.fn();
      wrapped.onDisconnect(onDisconnect);
      expect(() => fake.injectDisconnect()).not.toThrow();
      expect(onDisconnect).toHaveBeenCalledWith("stub: injected disconnect");
    } finally {
      vi.useRealTimers();
    }
  });
});
