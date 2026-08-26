import { describe, expect, it } from "vitest";
import {
  RECORDING_FORMAT_TAG,
  serializeRecording,
  parseRecording,
  type ParsedRecording,
  type RecordedEvent,
} from "./recording";
import { createReplayTransport } from "./replay";

/** `Omit` distributed per union member (a plain `Omit` on a discriminated
 *  union collapses to the members' common keys, dropping `dir`/`kind`) —
 *  mirrors `recording.ts`'s own (unexported) `RecordedEventInput`. */
type RecordedEventInput<E = RecordedEvent> = E extends RecordedEvent
  ? Omit<E, "seq">
  : never;

/** Builds a tiny recording inline through the real serialize/parse round
 *  trip (Step 1's own instruction), assigning `seq` by array index — the
 *  same thing a real recorder does. Chars/hex are plain opaque strings
 *  here; the replay engine never decodes them (this module's own header). */
function buildRecording(events: RecordedEventInput[]): ParsedRecording {
  const withSeq = events.map((e, seq) => ({ seq, ...e }) as RecordedEvent);
  const text = serializeRecording(
    { v: RECORDING_FORMAT_TAG, app: "replay.test", transport: "fake" },
    withSeq,
  );
  return parseRecording(text);
}

async function drain(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

describe("createReplayTransport", () => {
  it("B1: an early-t ack still waits for the write, never for the clock", async () => {
    const recording = buildRecording([
      { t: 100, dir: "tx", char: "W", hex: "01" },
      { t: 110, dir: "rx", char: "A", hex: "02" },
    ]);
    const { transport, run } = createReplayTransport(recording);

    let fired = false;
    transport.subscribe("A", () => {
      fired = true;
    });

    const runPromise = run();
    await drain();
    expect(fired).toBe(false);

    await transport.write("W", new Uint8Array([0x01]));
    const result = await runPromise;

    expect(fired).toBe(true);
    expect(result.divergences).toHaveLength(0);
  });

  it("logs a byte mismatch and releases the barrier anyway", async () => {
    const recording = buildRecording([
      { t: 100, dir: "tx", char: "W", hex: "01" },
      { t: 110, dir: "rx", char: "A", hex: "02" },
    ]);
    const { transport, run } = createReplayTransport(recording);

    let fired = false;
    transport.subscribe("A", () => {
      fired = true;
    });

    const runPromise = run();
    await transport.write("W", new Uint8Array([0x99]));
    const result = await runPromise;

    expect(fired).toBe(true);
    expect(result.divergences[0]).toMatch(/tx#0 .*expected/);
  });

  it("a barrier timeout is a divergence, never a hang", async () => {
    const recording = buildRecording([
      { t: 100, dir: "tx", char: "W", hex: "01" },
    ]);
    const { run } = createReplayTransport(recording, { barrierTimeoutMs: 50 });

    const result = await run();

    expect(result.divergences).toHaveLength(1);
    expect(result.divergences[0]).toMatch(/barrier timeout/);
  });

  it("the stream continues after a timeout release — a later rx still delivers", async () => {
    // Test 3 above (recording ends at the timed-out tx) can't distinguish
    // "playback continues past a released timeout" from "playback stalls
    // there" — this one puts an rx after the timed-out tx to prove the
    // walk genuinely resumes, not merely that run() eventually settles.
    const recording = buildRecording([
      { t: 100, dir: "tx", char: "W", hex: "01" },
      { t: 110, dir: "rx", char: "A", hex: "02" },
    ]);
    const { transport, run } = createReplayTransport(recording, {
      barrierTimeoutMs: 50,
    });

    let fired = false;
    transport.subscribe("A", () => {
      fired = true;
    });

    const result = await run();

    expect(fired).toBe(true);
    expect(result.divergences).toHaveLength(1);
    expect(result.divergences[0]).toMatch(/barrier timeout/);
  });

  it("fires the virtual clock's scheduled callbacks in due order", async () => {
    const recording = buildRecording([
      { t: 0, dir: "rx", char: "A", hex: "01" },
      { t: 5000, dir: "rx", char: "A", hex: "02" },
    ]);
    const { clock, run } = createReplayTransport(recording);

    let fireCount = 0;
    clock.schedule(() => {
      fireCount += 1;
    }, 3000);

    await run();

    expect(fireCount).toBe(1);
    expect(clock.now()).toBe(5000);
  });

  it("fans an rx out to every current subscriber, never retroactively", async () => {
    const recording = buildRecording([
      { t: 0, dir: "rx", char: "A", hex: "01" },
    ]);
    const { transport, run } = createReplayTransport(recording);

    let count1 = 0;
    let count2 = 0;
    transport.subscribe("A", () => {
      count1 += 1;
    });
    transport.subscribe("A", () => {
      count2 += 1;
    });

    await run();

    let lateCount = 0;
    transport.subscribe("A", () => {
      lateCount += 1;
    });

    expect(count1).toBe(1);
    expect(count2).toBe(1);
    expect(lateCount).toBe(0);
  });

  it("a write queued before its barrier is consumed there, with zero divergence", async () => {
    const recording = buildRecording([
      { t: 100, dir: "tx", char: "W", hex: "01" },
    ]);
    const { transport, run } = createReplayTransport(recording);

    await transport.write("W", new Uint8Array([0x01]));
    const result = await run();

    expect(result.divergences).toHaveLength(0);
  });

  // --- additive coverage tests (controller-requested fix-round) ---------

  it("scan() resolves the recorded device list", async () => {
    const devices = [
      { id: "dev-1", name: "PM5 432331249" },
      { id: "dev-2", name: "PM5 111222333" },
    ];
    const recording = buildRecording([{ t: 0, kind: "scan", devices }]);
    const { transport } = createReplayTransport(recording);

    await expect(transport.scan()).resolves.toStrictEqual(devices);
  });

  it("scan() resolves an empty list when nothing was recorded", async () => {
    const recording = buildRecording([
      { t: 0, dir: "rx", char: "A", hex: "01" },
    ]);
    const { transport } = createReplayTransport(recording);

    await expect(transport.scan()).resolves.toStrictEqual([]);
  });

  it("a recorded link-drop fires registered onDisconnect callbacks with the recorded reason, and a removed callback does not fire", async () => {
    const recording = buildRecording([
      { t: 0, kind: "link-drop", reason: "out-of-range" },
    ]);
    const { transport, run } = createReplayTransport(recording);

    let firedReason: string | null = null;
    transport.onDisconnect((reason) => {
      firedReason = reason;
    });

    let removedFired = false;
    const unsubscribeRemoved = transport.onDisconnect(() => {
      removedFired = true;
    });
    unsubscribeRemoved();

    await run();

    expect(firedReason).toBe("out-of-range");
    expect(removedFired).toBe(false);
  });

  it("clock.schedule()'s cancel prevents the callback from firing once its due time passes", async () => {
    const recording = buildRecording([
      { t: 0, dir: "rx", char: "A", hex: "01" },
      { t: 5000, dir: "rx", char: "A", hex: "02" },
    ]);
    const { clock, run } = createReplayTransport(recording);

    let fired = false;
    const cancel = clock.schedule(() => {
      fired = true;
    }, 3000);
    cancel();

    await run();

    expect(fired).toBe(false);
    expect(clock.now()).toBe(5000);
  });

  it("subscribe()'s unsubscribe stops delivery of a later rx on the same characteristic", async () => {
    // A tx barrier separates the two rx events so the test can park run()
    // deterministically between them (same technique as the B1 test above)
    // — with no barrier, run()'s own 25-iteration drain per rx can settle
    // both deliveries before the test's drain() ever returns, racing the
    // unsubscribe() call against delivery instead of proving it.
    const recording = buildRecording([
      { t: 0, dir: "rx", char: "A", hex: "01" },
      { t: 50, dir: "tx", char: "W", hex: "01" },
      { t: 60, dir: "rx", char: "A", hex: "02" },
    ]);
    const { transport, run } = createReplayTransport(recording);

    let count = 0;
    const unsubscribe = transport.subscribe("A", () => {
      count += 1;
    });

    const runPromise = run();
    await drain();
    expect(count).toBe(1); // only the first rx; run() is parked at the barrier

    unsubscribe();
    await transport.write("W", new Uint8Array([0x01]));
    const result = await runPromise;

    expect(count).toBe(1); // the second rx delivered to nobody
    expect(result.divergences).toHaveLength(0);
  });

  it("advances through several out-of-order pending timers, firing earliest-due first", async () => {
    const recording = buildRecording([
      { t: 5000, dir: "rx", char: "A", hex: "01" },
    ]);
    const { clock, run } = createReplayTransport(recording);

    const fireOrder: string[] = [];
    // Scheduled in an order that is NEITHER ascending nor descending by due
    // time, so `advanceClock`'s earliest-of-the-remaining scan has to both
    // reassign its candidate (a later-scanned timer that's due SOONER) and
    // skip reassigning (a later-scanned timer that's due LATER) across the
    // three timers it removes one at a time.
    clock.schedule(() => fireOrder.push("A@2000"), 2000);
    clock.schedule(() => fireOrder.push("B@500"), 500);
    clock.schedule(() => fireOrder.push("C@1000"), 1000);

    await run();

    expect(fireOrder).toStrictEqual(["B@500", "C@1000", "A@2000"]);
    expect(clock.now()).toBe(5000);
  });

  it("a driver-initiated event kind (e.g. connect) walked by run() is a no-op, never a barrier", async () => {
    const recording = buildRecording([
      { t: 0, kind: "connect", id: "dev-1" },
      { t: 10, dir: "rx", char: "A", hex: "01" },
    ]);
    const { transport, run } = createReplayTransport(recording);

    let fired = false;
    transport.subscribe("A", () => {
      fired = true;
    });

    const result = await run();

    expect(fired).toBe(true);
    expect(result.divergences).toHaveLength(0);
  });
});

// Phase LM Task 4 (design spec `2026-08-26-lost-monitor-trigger-design.md`):
// the recording vocabulary now carries app-lifecycle transitions, because a
// defect that enters ABOVE the transport seam was invisible to every gate this
// project owns. These pin the engine's half of that; `lifecycleReplay.test.ts`
// pins what the session does with one.
describe("createReplayTransport: lifecycle events (Phase LM Task 4)", () => {
  it("delivers a recorded lifecycle transition to onLifecycle, in recorded order, with the clock already advanced to its t", async () => {
    const recording = buildRecording([
      { t: 10, dir: "rx", char: "A", hex: "01" },
      { t: 500, kind: "lifecycle", event: "background" },
      { t: 900, kind: "lifecycle", event: "foreground" },
      { t: 1000, dir: "rx", char: "A", hex: "02" },
    ]);
    const seen: { event: string; at: number }[] = [];
    const { transport, clock, run } = createReplayTransport(recording, {
      onLifecycle: (event) => seen.push({ event, at: clock.now() }),
    });

    const delivered: string[] = [];
    transport.subscribe("A", () => delivered.push(`rx@${clock.now()}`));

    const result = await run();

    expect(seen).toStrictEqual([
      { event: "background", at: 500 },
      { event: "foreground", at: 900 },
    ]);
    // The stream around it is untouched — a lifecycle event orders and
    // advances like any other, and swallows nothing.
    expect(delivered).toStrictEqual(["rx@10", "rx@1000"]);
    expect(result.divergences).toHaveLength(0);
  });

  it("a recorded lifecycle event with no handler wired is a DIVERGENCE, never a silent skip — a replay that quietly drops this class is the blindness Task 4 removes", async () => {
    const recording = buildRecording([
      { t: 500, kind: "lifecycle", event: "foreground" },
      { t: 600, dir: "rx", char: "A", hex: "01" },
    ]);
    const { transport, run } = createReplayTransport(recording);

    let fired = false;
    transport.subscribe("A", () => {
      fired = true;
    });

    const result = await run();

    expect(result.divergences).toStrictEqual([
      "lifecycle#0 foreground not delivered (no onLifecycle handler)",
    ]);
    // Loud, but not fatal: the rest of the log still plays, the same
    // posture a byte mismatch already takes.
    expect(fired).toBe(true);
  });
});
