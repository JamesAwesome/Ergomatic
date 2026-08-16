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
});
