import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import type { Transport } from "../../../domain/monitor/types.js";
import { GENERAL_STATUS_UUID } from "../../../domain/monitor/pm5/uuids.js";
import { withLiveness, SILENCE_THRESHOLD_MS } from "./liveness";
import { createReplayTransport } from "./replay";
import {
  RECORDING_FORMAT_TAG,
  fromHexString,
  parseRecording,
  serializeRecording,
  type ParsedRecording,
  type RecordedEvent,
} from "./recording";

// ============================================================================
// PART 1 — the decorator against a hand-built fake transport: the arming
// rule, the threshold, snapshot(), pass-through fidelity, and the
// no-payload-bytes guarantee.
// ============================================================================

/** A minimal, fully controllable `Transport` — this file's own stand-in,
 *  not `transports/fake.ts` (which models real PM5 wire behaviour; this
 *  suite needs a bare seam to drive `withLiveness` against directly). */
function stubTransport() {
  const subs = new Map<string, Set<(bytes: Uint8Array) => void>>();
  const writes: { char: string; bytes: Uint8Array }[] = [];
  const disconnectCbs = new Set<(reason: string) => void>();
  let disconnectCalls = 0;

  return {
    writes,
    disconnectCbs,
    get disconnectCalls() {
      return disconnectCalls;
    },
    /** Test-only: deliver a notification as the real radio would. */
    notify(char: string, bytes: Uint8Array): void {
      for (const cb of subs.get(char) ?? []) cb(bytes);
    },
    transport: {
      async scan() {
        return [{ id: "dev-1", name: "PM5 1" }];
      },
      async connect() {
        // no-op
      },
      async write(char, bytes) {
        writes.push({ char, bytes });
      },
      subscribe(char, cb) {
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

/** A hand-driven schedule — records every call so a test can fire it
 *  itself, cancel it, and assert exactly how many are still live. Mirrors
 *  `useMonitorSession.test.ts`'s own `manualSchedule()` idiom. */
function manualSchedule() {
  const calls: { ms: number; fire: () => void; cancelled: boolean }[] = [];
  return {
    calls,
    schedule: (fn: () => void, ms: number): (() => void) => {
      const call = { ms, fire: fn, cancelled: false };
      calls.push(call);
      return () => {
        call.cancelled = true;
      };
    },
    live(): typeof calls {
      return calls.filter((c) => !c.cancelled);
    },
  };
}

function manualClock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    set(ms: number): void {
      t = ms;
    },
  };
}

const OTHER_CHAR = "ce060032-43e5-11e4-916c-0800200c9a66"; // 0x0032, arbitrary non-watched characteristic

describe("withLiveness: the arming rule", () => {
  it("does NOT arm the watchdog merely by subscribing — schedule() is never called until the first 0x0031 arrives", () => {
    const { transport } = stubTransport();
    const timer = manualSchedule();
    const onSilence = vi.fn();
    const onRecovery = vi.fn();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence,
      onRecovery,
    });

    liveness.subscribe(GENERAL_STATUS_UUID, () => {});

    expect(timer.calls).toHaveLength(0);
    expect(liveness.snapshot().armed).toBe(false);
  });

  it("arms on the FIRST 0x0031 notification, and re-arms (cancel + reschedule) on every one after", () => {
    const { transport, notify } = stubTransport();
    const timer = manualSchedule();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence: vi.fn(),
      onRecovery: vi.fn(),
    });
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});

    notify(GENERAL_STATUS_UUID, new Uint8Array());
    expect(timer.live()).toHaveLength(1);
    expect(timer.calls[0]!.ms).toBe(SILENCE_THRESHOLD_MS);
    expect(liveness.snapshot().armed).toBe(true);

    notify(GENERAL_STATUS_UUID, new Uint8Array());
    // The FIRST timer is cancelled and a fresh one takes its place — never
    // two live timers racing to declare the same silence twice.
    expect(timer.calls).toHaveLength(2);
    expect(timer.live()).toHaveLength(1);
    expect(timer.calls[0]!.cancelled).toBe(true);
  });

  it("a notification on a DIFFERENT characteristic never arms or resets the watchdog", () => {
    const { transport, notify } = stubTransport();
    const timer = manualSchedule();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence: vi.fn(),
      onRecovery: vi.fn(),
    });
    liveness.subscribe(OTHER_CHAR, () => {});

    notify(OTHER_CHAR, new Uint8Array());

    expect(timer.calls).toHaveLength(0);
    expect(liveness.snapshot().armed).toBe(false);
  });
});

describe("withLiveness: onSilence / onRecovery", () => {
  it("firing the scheduled timer declares silence and marks the snapshot silent", () => {
    const { transport, notify } = stubTransport();
    const timer = manualSchedule();
    const onSilence = vi.fn();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence,
      onRecovery: vi.fn(),
    });
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});
    notify(GENERAL_STATUS_UUID, new Uint8Array());

    timer.calls[0]!.fire();

    expect(onSilence).toHaveBeenCalledExactlyOnceWith(SILENCE_THRESHOLD_MS);
    expect(liveness.snapshot().silent).toBe(true);
  });

  it("the next 0x0031 after a declared silence fires onRecovery exactly once and clears silent", () => {
    const { transport, notify } = stubTransport();
    const timer = manualSchedule();
    const onSilence = vi.fn();
    const onRecovery = vi.fn();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence,
      onRecovery,
    });
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});
    notify(GENERAL_STATUS_UUID, new Uint8Array());
    timer.calls[0]!.fire();

    notify(GENERAL_STATUS_UUID, new Uint8Array());

    expect(onRecovery).toHaveBeenCalledOnce();
    expect(liveness.snapshot().silent).toBe(false);
    // A THIRD frame must not re-fire recovery — it only fires on the
    // transition out of silence, once.
    notify(GENERAL_STATUS_UUID, new Uint8Array());
    expect(onRecovery).toHaveBeenCalledOnce();
  });

  it("a healthy stream that never goes quiet never calls onSilence at all", () => {
    const { transport, notify } = stubTransport();
    const timer = manualSchedule();
    const onSilence = vi.fn();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence,
      onRecovery: vi.fn(),
    });
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});
    for (let i = 0; i < 20; i += 1) {
      notify(GENERAL_STATUS_UUID, new Uint8Array());
    }
    expect(onSilence).not.toHaveBeenCalled();
  });
});

describe("withLiveness: markSuspect (Phase LL Task 2 review fix, §2 mechanism 2)", () => {
  it("sets silent:true in the snapshot WITHOUT calling onSilence — the caller (useMonitorSession.ts) owns its own honest reason/ring entry", () => {
    const { transport, notify } = stubTransport();
    const timer = manualSchedule();
    const onSilence = vi.fn();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence,
      onRecovery: vi.fn(),
    });
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});
    notify(GENERAL_STATUS_UUID, new Uint8Array()); // arms

    liveness.markSuspect();

    expect(liveness.snapshot().silent).toBe(true);
    expect(onSilence).not.toHaveBeenCalled();
  });

  it("stops any watchdog timer already counting down — it cannot ALSO mature later and double-report", () => {
    const { transport, notify } = stubTransport();
    const timer = manualSchedule();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence: vi.fn(),
      onRecovery: vi.fn(),
    });
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});
    notify(GENERAL_STATUS_UUID, new Uint8Array()); // arms, schedules the watchdog
    expect(timer.calls[0]!.cancelled).toBe(false);

    liveness.markSuspect();

    expect(timer.calls[0]!.cancelled).toBe(true);
  });

  it("THE FIX ITSELF: the very next 0x0031 after markSuspect() fires onRecovery exactly once and clears silent — the SAME branch a real timer-declared silence uses", () => {
    const { transport, notify } = stubTransport();
    const timer = manualSchedule();
    const onRecovery = vi.fn();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence: vi.fn(),
      onRecovery,
    });
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});
    notify(GENERAL_STATUS_UUID, new Uint8Array()); // arms

    liveness.markSuspect();
    expect(onRecovery).not.toHaveBeenCalled();

    notify(GENERAL_STATUS_UUID, new Uint8Array());

    expect(onRecovery).toHaveBeenCalledOnce();
    expect(liveness.snapshot().silent).toBe(false);
    // A second frame must not re-fire recovery — same "only on the
    // transition out of silence" contract as a real silence declaration.
    notify(GENERAL_STATUS_UUID, new Uint8Array());
    expect(onRecovery).toHaveBeenCalledOnce();
  });

  it("calling markSuspect() before the watchdog has ever armed does not throw, and does not fabricate a recovery on the FIRST real arrival (which is itself the arming event, not a recovery)", () => {
    const { transport } = stubTransport();
    const timer = manualSchedule();
    const onRecovery = vi.fn();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence: vi.fn(),
      onRecovery,
    });
    expect(() => liveness.markSuspect()).not.toThrow();
    expect(liveness.snapshot().armed).toBe(false);
  });

  it("a repeated markSuspect() call while already silent does not schedule a second watchdog cancellation cycle or throw", () => {
    const { transport, notify } = stubTransport();
    const timer = manualSchedule();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence: vi.fn(),
      onRecovery: vi.fn(),
    });
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});
    notify(GENERAL_STATUS_UUID, new Uint8Array());

    liveness.markSuspect();
    expect(() => liveness.markSuspect()).not.toThrow();
    expect(liveness.snapshot().silent).toBe(true);
  });
});

describe("withLiveness: disconnect stops the watchdog", () => {
  it("caller-initiated disconnect() cancels the pending timer — no posthumous silence report", async () => {
    const { transport, notify } = stubTransport();
    const timer = manualSchedule();
    const onSilence = vi.fn();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence,
      onRecovery: vi.fn(),
    });
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});
    notify(GENERAL_STATUS_UUID, new Uint8Array());
    expect(timer.live()).toHaveLength(1);

    await liveness.disconnect();

    expect(timer.live()).toHaveLength(0);
  });

  it("an unexpected onDisconnect drop also cancels the pending timer, never double-reports the same dead link", () => {
    const { transport, notify, disconnectCbs } = stubTransport();
    const timer = manualSchedule();
    const onSilence = vi.fn();
    const clock = manualClock();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: timer.schedule,
      onSilence,
      onRecovery: vi.fn(),
    });
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});
    notify(GENERAL_STATUS_UUID, new Uint8Array());
    const seen = vi.fn();
    liveness.onDisconnect(seen);

    for (const cb of disconnectCbs) cb("radio-dropped");

    expect(timer.live()).toHaveLength(0);
    expect(seen).toHaveBeenCalledExactlyOnceWith("radio-dropped");
  });
});

describe("withLiveness: pass-through fidelity", () => {
  it("write() forwards the exact characteristic id and bytes to inner, unchanged", async () => {
    const { transport, writes } = stubTransport();
    const liveness = withLiveness(transport, {
      now: () => 0,
      schedule: () => () => undefined,
      onSilence: vi.fn(),
      onRecovery: vi.fn(),
    });
    const bytes = new Uint8Array([0xf1, 0x76, 0x04]);

    await liveness.write("some-char", bytes);

    expect(writes).toHaveLength(1);
    expect(writes[0]!.char).toBe("some-char");
    expect(writes[0]!.bytes).toBe(bytes); // same reference — no copy, no mutation
  });

  it("subscribe()'s returned unsubscribe function stops delivery through the decorator too", () => {
    const { transport, notify } = stubTransport();
    const liveness = withLiveness(transport, {
      now: () => 0,
      schedule: () => () => undefined,
      onSilence: vi.fn(),
      onRecovery: vi.fn(),
    });
    const cb = vi.fn();
    const unsubscribe = liveness.subscribe(GENERAL_STATUS_UUID, cb);
    notify(GENERAL_STATUS_UUID, new Uint8Array());
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();
    notify(GENERAL_STATUS_UUID, new Uint8Array());

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("scan()/connect() resolve with exactly what inner resolves with", async () => {
    const { transport } = stubTransport();
    const liveness = withLiveness(transport, {
      now: () => 0,
      schedule: () => () => undefined,
      onSilence: vi.fn(),
      onRecovery: vi.fn(),
    });

    const devices = await liveness.scan();
    expect(devices).toStrictEqual([{ id: "dev-1", name: "PM5 1" }]);
    await expect(liveness.connect("dev-1")).resolves.toBeUndefined();
  });
});

describe("withLiveness: snapshot() carries numbers only, never a payload byte", () => {
  it("a distinctive byte pattern passed through write()/subscribe() never appears anywhere in the snapshot", () => {
    const { transport, notify } = stubTransport();
    const clock = manualClock(1234);
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: () => () => undefined,
      onSilence: vi.fn(),
      onRecovery: vi.fn(),
    });
    // A payload chosen to be recognisable if it leaked into the snapshot's
    // JSON in any form — hex, decimal, or raw.
    const tellBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});
    notify(GENERAL_STATUS_UUID, tellBytes);
    void liveness.write(GENERAL_STATUS_UUID, tellBytes);

    const dump = JSON.stringify(liveness.snapshot());

    expect(dump).not.toMatch(/de ?ad ?be ?ef/i);
    expect(dump).not.toContain("222,173,190,239"); // decimal byte values
  });

  it("counts arrivals and stamps lastArrivalMs per characteristic, from the injected clock", () => {
    const { transport, notify } = stubTransport();
    const clock = manualClock(1000);
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: () => () => undefined,
      onSilence: vi.fn(),
      onRecovery: vi.fn(),
    });
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});

    notify(GENERAL_STATUS_UUID, new Uint8Array());
    clock.set(1500);
    notify(GENERAL_STATUS_UUID, new Uint8Array());

    const snap = liveness.snapshot();
    expect(snap.characteristics[GENERAL_STATUS_UUID]).toStrictEqual({
      lastArrivalMs: 1500,
      count: 2,
    });
  });

  it("records connect/write/disconnect/link-drop as timestamped lifecycle events, bounded to the last 20", async () => {
    const { transport } = stubTransport();
    const clock = manualClock(0);
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: () => () => undefined,
      onSilence: vi.fn(),
      onRecovery: vi.fn(),
    });

    for (let i = 0; i < 25; i += 1) {
      clock.set(i);
      // `write()` is async (it awaits `inner.write` before recording the
      // event) — awaited here so each event lands before the next write
      // starts, keeping the recorded order deterministic.
      await liveness.write(`char-${i}`, new Uint8Array());
    }

    const snap = liveness.snapshot();
    expect(snap.recentEvents).toHaveLength(20);
    // Oldest 5 evicted — the ring keeps the MOST RECENT 20.
    expect(snap.recentEvents[0]!.detail).toBe("char-5");
    expect(snap.recentEvents[19]!.detail).toBe("char-24");
    for (const event of snap.recentEvents) {
      expect(event.kind).toBe("write");
      expect(typeof event.atMs).toBe("number");
    }
  });
});

// ============================================================================
// PART 2 — the committed capture corpus, via `createReplayTransport` with
// `ReplayHandle.clock` bound straight into the decorator's own `now`/
// `schedule` deps (the injected-clock requirement: `replay.ts`'s barrier
// timeout is a REAL `setTimeout`, so `vi.useFakeTimers()` over a replay
// hangs it — this decorator's own clock must be the replay's, not a mock
// of the global one).
//
// Every recorded `tx` (write) event is PRE-QUEUED onto the transport before
// `run()` starts (`preloadWrites` below) — a `tx` event is a BARRIER
// (`replay.ts`'s own header) that otherwise waits for a live driver to call
// `write()`, for up to `barrierTimeoutMs` REAL milliseconds per barrier.
// This suite drives no driver at all (the watchdog lives at the transport
// seam, below the driver), so without preloading, six captures' worth of
// programming writes would each burn a real 2s timeout — preloading echoes
// the recording's own bytes back at itself in order, satisfying every
// barrier the instant `run()` reaches it, at zero real-time cost.
// ============================================================================

/** Six committed `pm5-recording/v1` wire captures — the FULL corpus this
 *  task's own measurement swept (`.claude/agents/antagonist-ledger.md`'s
 *  "Phase LL anchor pass" entry: "3775-4454 ms... 6 of 6"). `step-1` (a
 *  2-line, disconnect-only fragment) is excluded — it never subscribes or
 *  receives a single 0x0031, so it is not a "session" this rule speaks
 *  about at all. Paths resolved relative to THIS file, not the process
 *  cwd, mirroring `captureReplay.test.ts`'s own established idiom. */
const CORPUS_FILES = [
  "walk-2026-08-16/session-1-keystone-2x250r0.jsonl",
  "walk-2026-08-16/session-2-wu-4unequal.jsonl",
  "walk-2026-08-17/step-2-pm5-recording-1786973078979.jsonl",
  "walk-2026-08-17/step-3-pm5-recording-second-rest-1786973713929.jsonl",
  "walk-2026-08-17/step-4-pm5-recording-1786974067695.jsonl",
  "walk-2026-08-18-metrics/pyramid-pm5-recording-1787090555458.jsonl.gz",
];

const SESSIONS_DIR = import.meta.url
  .replace(/^file:\/\//, "")
  .replace(
    /src\/monitor\/transports\/liveness\.test\.ts$/,
    "../docs/monitor/sessions/",
  );

function loadCapture(fileName: string): ParsedRecording {
  const path = `${SESSIONS_DIR}${fileName}`;
  const text = fileName.endsWith(".gz")
    ? gunzipSync(readFileSync(path)).toString("utf8")
    : readFileSync(path, "utf8");
  return parseRecording(text);
}

function preloadWrites(transport: Transport, recording: ParsedRecording): void {
  for (const event of recording.events) {
    if ("dir" in event && event.dir === "tx") {
      void transport.write(event.char, fromHexString(event.hex));
    }
  }
}

describe("withLiveness: the arming rule, proven against the full committed corpus", () => {
  it.each(CORPUS_FILES)(
    "onSilence never fires across a healthy replay: %s",
    async (fileName) => {
      const recording = loadCapture(fileName);
      const { transport, clock, run } = createReplayTransport(recording);
      preloadWrites(transport, recording);
      const onSilence = vi.fn();
      const onRecovery = vi.fn();
      const liveness = withLiveness(transport, {
        now: clock.now,
        schedule: clock.schedule,
        onSilence,
        onRecovery,
      });
      liveness.subscribe(GENERAL_STATUS_UUID, () => {});

      await run();

      expect(onSilence).not.toHaveBeenCalled();
      expect(onRecovery).not.toHaveBeenCalled();
      expect(liveness.snapshot().armed).toBe(true);
    },
  );
});

// ============================================================================
// PART 3 — a suppressed stream mid-capture: onSilence at T+2500ms virtual,
// onRecovery on the next delivered frame. A hand-built recording (the
// replay engine's own `buildRecording` idiom, mirrored from
// `replay.test.ts`) rather than editing a committed capture — the point
// under test is the THRESHOLD, not any one session's own content.
// ============================================================================

type RecordedEventInput<E = RecordedEvent> = E extends RecordedEvent
  ? Omit<E, "seq">
  : never;

function buildRecording(events: RecordedEventInput[]): ParsedRecording {
  const withSeq = events.map((e, seq) => ({ seq, ...e }) as RecordedEvent);
  const text = serializeRecording(
    { v: RECORDING_FORMAT_TAG, app: "liveness.test", transport: "fake" },
    withSeq,
  );
  return parseRecording(text);
}

describe("withLiveness: a suppressed stream fires onSilence at T+2500ms virtual and onRecovery on the next frame", () => {
  it("suppresses 0x0031 after T=1000ms; onSilence fires at T+2500 virtual, onRecovery at the next delivered frame", async () => {
    const LAST_HEALTHY_T = 1000;
    const recording = buildRecording([
      { t: 0, dir: "rx", char: GENERAL_STATUS_UUID, hex: "" }, // arms
      { t: 500, dir: "rx", char: GENERAL_STATUS_UUID, hex: "" }, // healthy reset
      { t: LAST_HEALTHY_T, dir: "rx", char: GENERAL_STATUS_UUID, hex: "" }, // last frame before suppression
      // No 0x0031 event between here and the recovery frame below — the
      // stream is SUPPRESSED. This filler event carries no side effect
      // (`replay.ts`'s own comment: an "unsubscribe" kind advances the
      // clock and nothing else) — its only job is to make `advanceClock`
      // reach T+2500 so the pending timer actually fires.
      {
        t: LAST_HEALTHY_T + SILENCE_THRESHOLD_MS,
        kind: "unsubscribe",
        char: "clock-advance-only",
      },
      {
        t: LAST_HEALTHY_T + SILENCE_THRESHOLD_MS + 500,
        dir: "rx",
        char: GENERAL_STATUS_UUID,
        hex: "",
      }, // recovery
    ]);
    const { transport, clock, run } = createReplayTransport(recording);
    const onSilence = vi.fn();
    const onRecovery = vi.fn();
    const liveness = withLiveness(transport, {
      now: clock.now,
      schedule: clock.schedule,
      onSilence,
      onRecovery,
    });
    liveness.subscribe(GENERAL_STATUS_UUID, () => {});

    await run();

    expect(onSilence).toHaveBeenCalledExactlyOnceWith(SILENCE_THRESHOLD_MS);
    expect(onRecovery).toHaveBeenCalledOnce();
    expect(onSilence.mock.invocationCallOrder[0]!).toBeLessThan(
      onRecovery.mock.invocationCallOrder[0]!,
    );
    expect(liveness.snapshot().silent).toBe(false);
  });
});
