import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKOUTSTATE_WAITTOBEGIN } from "../../../domain/monitor/pm5/parse.js";
import {
  GENERAL_STATUS_UUID,
  SAMPLE_RATE_UUID,
} from "../../../domain/monitor/pm5/uuids.js";
import type { WorkoutProgram } from "../../../domain/monitor/program.js";
import type { Transport } from "../../../domain/monitor/types.js";
import { autoTicking, resolveDefaultTransport } from "./index";
import { HOLD_OPEN_MS } from "./holdOpen";
import { createWebBluetoothTransport } from "./webBluetooth";

// `createWebBluetoothTransport` is mocked for the whole file (hoisted, per
// vi.mock's own contract) — every OTHER test in this file still returns
// `null` off this arm because jsdom's `navigator.bluetooth` is `undefined`
// by default and the `navigator.bluetooth ? ... : null` ternary short-
// circuits before ever calling the mock; only the tests below stub
// `navigator.bluetooth` truthy to actually reach it.
vi.mock("./webBluetooth", () => ({
  createWebBluetoothTransport: vi.fn(),
}));

/** Installs (or removes) a `navigator.bluetooth` stub for exactly one test —
 *  same idiom as `WorkoutDetail.test.tsx`'s own `stubBluetooth` (jsdom has
 *  no Web Bluetooth of its own; `navigator.bluetooth` is `undefined` by
 *  default). */
function stubBluetooth(bt: object): () => void {
  const original = Object.getOwnPropertyDescriptor(
    Navigator.prototype,
    "bluetooth",
  );
  Object.defineProperty(navigator, "bluetooth", {
    value: bt,
    configurable: true,
  });
  return () => {
    delete (navigator as { bluetooth?: unknown }).bluetooth;
    if (original) {
      Object.defineProperty(Navigator.prototype, "bluetooth", original);
    }
  };
}

/** A minimal `Transport` stub standing in for the real web transport
 *  `createWebBluetoothTransport()` would otherwise build — this file's
 *  tests are about transport SELECTION and the recording-tap wiring, never
 *  about `webBluetooth.ts`'s own GATT behaviour (that module is excluded
 *  from the coverage gate for exactly that reason, see its own header). */
function stubWebTransport(): Transport {
  return {
    scan: () => Promise.resolve([]),
    connect: () => Promise.resolve(),
    write: () => Promise.resolve(),
    subscribe: () => () => undefined,
    disconnect: () => Promise.resolve(),
    onDisconnect: () => () => undefined,
  };
}

// A minimal one-interval program — this file's own tests are about
// TRANSPORT SELECTION and the auto-tick wrapper, never about the fake's
// byte-level behaviour (that's `fake.test.ts`'s job), so the program only
// needs to be well-formed enough for `createFakeTransport` to accept it.
const PROGRAM: WorkoutProgram = {
  intervals: [
    {
      type: "work",
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
    delete window.__pm5Recording__;
    delete window.__pm5HoldOpen__;
    delete (navigator as { bluetooth?: unknown }).bluetooth;
    vi.mocked(createWebBluetoothTransport).mockReset();
    sessionStorage.clear();
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

  it("wraps the REAL web transport in a recording tap and sets window.__pm5Recording__ — the seam this task exists for", async () => {
    const restore = stubBluetooth({});
    vi.mocked(createWebBluetoothTransport).mockReturnValue(stubWebTransport());

    expect(window.__pm5Recording__).toBeUndefined();
    const transport = await resolveDefaultTransport();
    expect(transport).not.toBeNull();

    expect(window.__pm5Recording__).toBeDefined();
    expect(window.__pm5Recording__!.eventCount()).toBe(0);
    await transport!.write(SAMPLE_RATE_UUID, new Uint8Array(1));
    expect(window.__pm5Recording__!.eventCount()).toBe(1);
    expect(window.__pm5Recording__!.lines()).toHaveLength(1);

    restore();
  });

  it("wires a working download() through the seam — not merely present, invoked (fix round, Task 6)", async () => {
    // Rule #4 (this repo's own recurring-failure list): a thing existing is
    // not a thing working — invoke it and assert the consequence, the same
    // way `ConnectionLogSheet.test.tsx`'s B4 test does for the sheet side
    // of this seam.
    const restore = stubBluetooth({});
    vi.mocked(createWebBluetoothTransport).mockReturnValue(stubWebTransport());
    const { parseRecording } = await import("./recording");

    const transport = await resolveDefaultTransport();
    await transport!.write(SAMPLE_RATE_UUID, new Uint8Array(1));

    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-index-seam");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await window.__pm5Recording__!.download(PROGRAM);

    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    const parsed = parseRecording(await blob.text());
    expect(parsed.header.app).toBe("dev");
    expect(parsed.header.transport).toBe("web");
    expect(parsed.header.program).toStrictEqual(PROGRAM);
    // The one write above, recorded by the SAME tap `download()` closes
    // over — not a fresh/empty one.
    expect(parsed.events).toHaveLength(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-index-seam");

    restore();
  });

  it("the FAKE arm never sets window.__pm5Recording__ — recording only wraps the real radio", async () => {
    window.__pm5FakeScript__ = { program: PROGRAM };
    const transport = await resolveDefaultTransport();
    expect(transport).not.toBeNull();
    expect(window.__pm5Recording__).toBeUndefined();
  });

  it("a second resolveDefaultTransport() call REPLACES the global — a reconnect's tap fully supersedes the earlier session's, review finding", async () => {
    const restore = stubBluetooth({});
    vi.mocked(createWebBluetoothTransport).mockReturnValue(stubWebTransport());

    // First session: one write, one recorded event.
    const first = await resolveDefaultTransport();
    await first!.write(SAMPLE_RATE_UUID, new Uint8Array(1));
    const firstSeam = window.__pm5Recording__!;
    expect(firstSeam.eventCount()).toBe(1);

    // Second session (a reconnect): a fresh call, a fresh tap.
    vi.mocked(createWebBluetoothTransport).mockReturnValue(stubWebTransport());
    const second = await resolveDefaultTransport();
    const secondSeam = window.__pm5Recording__!;

    // The global now points at the SECOND tap, not the first — a distinct
    // object, starting from zero, unaffected by the first session's write.
    expect(secondSeam).not.toBe(firstSeam);
    expect(secondSeam.eventCount()).toBe(0);

    await second!.write(SAMPLE_RATE_UUID, new Uint8Array(1));

    // The seam reflects only the SECOND tap's events — the first session's
    // recorded write is no longer reachable through window.__pm5Recording__
    // at all; only a reference the caller separately held onto (`firstSeam`
    // here) still sees it, which is the whole point of the finding: nothing
    // product code held that reference, so a rower who reconnects before
    // downloading loses it.
    expect(window.__pm5Recording__!.eventCount()).toBe(1);
    expect(firstSeam.eventCount()).toBe(1);

    restore();
  });

  // -------------------------------------------------------------------
  // Hold-open wiring (Phase RC spec 1 Task 3) — the decorator composes
  // OUTSIDE the recording tap (`holdOpen(tap.transport)`) so the tap keeps
  // recording raw bytes during the hold; `window.__pm5HoldOpen__` is the
  // seam's own controls handle, set only inside the same
  // `fakeMonitorEnabled` gate the tap itself lives behind.
  // -------------------------------------------------------------------

  it("defers the wrapped transport's real disconnect() once window.__pm5HoldOpen__.arm() is called — disconnect() itself still resolves immediately", async () => {
    vi.useFakeTimers();
    try {
      const restore = stubBluetooth({});
      const innerDisconnect = vi.fn().mockResolvedValue(undefined);
      vi.mocked(createWebBluetoothTransport).mockReturnValue({
        ...stubWebTransport(),
        disconnect: innerDisconnect,
      });

      const transport = await resolveDefaultTransport();
      expect(window.__pm5HoldOpen__).toBeDefined();
      window.__pm5HoldOpen__!.arm();
      expect(window.__pm5HoldOpen__!.status().state).toBe("armed");

      // Resolves immediately — a caller like `bestEffort(driver.disconnect())`
      // must never hang on the held-open window.
      await transport!.disconnect();
      expect(window.__pm5HoldOpen__!.status().state).toBe("holding");
      // ...but the REAL disconnect to the wrapped web transport has not
      // fired yet — it is deferred by HOLD_OPEN_MS.
      expect(innerDisconnect).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(HOLD_OPEN_MS);
      expect(innerDisconnect).toHaveBeenCalledTimes(1);
      expect(window.__pm5HoldOpen__!.status().state).toBe("disarmed");

      restore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the hold-open stash appends to a pre-existing sessionStorage key and leaves an absent key absent", async () => {
    const restore = stubBluetooth({});
    vi.mocked(createWebBluetoothTransport).mockReturnValue(stubWebTransport());

    sessionStorage.setItem("ergomatic:last-monitor-log", "prior monitor lines");
    expect(sessionStorage.getItem("ergomatic:last-rowed-log")).toBeNull();

    const transport = await resolveDefaultTransport();
    window.__pm5HoldOpen__!.arm();
    await transport!.disconnect(); // -> holding
    await window.__pm5HoldOpen__!.release(); // ends the hold now, stashes the ring

    const monitorLog = sessionStorage.getItem("ergomatic:last-monitor-log");
    expect(monitorLog).not.toBeNull();
    // APPENDS to the prior content — never replaces it.
    expect(monitorLog!.startsWith("prior monitor lines\n")).toBe(true);
    expect(monitorLog).toContain("hold-open window (instrument)");
    // A session that never rowed has no "ergomatic:last-rowed-log" key —
    // appending only when the key already exists means this stash never
    // invents one.
    expect(sessionStorage.getItem("ergomatic:last-rowed-log")).toBeNull();

    restore();
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
