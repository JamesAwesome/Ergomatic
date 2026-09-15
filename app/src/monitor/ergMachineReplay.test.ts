// RF24's test: one that starts UPSTREAM of the producer.
//
// `driver.test.ts`'s machine-type tests all hand-build a single 0x0032 and
// assert the header. Every one stays green against the bug this file exists
// for, because a hand-built frame cannot reproduce what hardware actually
// does: interleave 0x0031 -> 0x0032 -> 0x0033 on every tick, 174 times, and
// end the session on a NON-carrier. `classifyErgMachine` runs on every clean
// decode of every characteristic, `setMeta` is last-write-wins, and only
// 0x0032/0x0038 carry `ergMachineType` — so the non-carriers used to erase
// the honest reading and the exported header said `null` on a RowErg that
// reported 0 on the wire 174 times.
//
// James found it by reading the ring this capture came from. This replays
// that walk's own bytes through the real transport seam and the real driver
// and asserts the header survives.
import { describe, expect, it } from "vitest";
import { createEventLog } from "./eventLog";
import { createSubscribedDriver } from "../test/statusSubscriptions";
import { parseRecording } from "./transports/recording";
import { createReplayTransport } from "./transports/replay";
import { readCapture } from "../test/captures";

const WALK_DIR = "walk-2026-09-15-work-clock";
const CAPTURE = "pm5-recording-1789471533667.jsonl.gz";

/** 0x0032 and 0x0038 carry `ergMachineType`; nothing else does. */
const CARRIERS = new Set(["ce060032", "ce060038"]);

function statusCharacteristics(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (line === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const row = parsed as { char?: string; hex?: string };
    if (typeof row.char !== "string" || typeof row.hex !== "string") continue;
    if (row.char.startsWith("ce0600")) out.push(row.char.slice(0, 8));
  }
  return out;
}

describe("ergMachineType survives a real session's characteristic interleave", () => {
  const text = readCapture(WALK_DIR, CAPTURE);

  // THE FIXTURE PROPERTY IS AN ASSERTION, NOT A COMMENT (RF38). This test's
  // whole ability to fail rests on the capture ENDING on a non-carrier. Swap
  // in a capture that ends on 0x0032 and the test would stay green while
  // proving nothing — so the property is pinned here, where a swap breaks it
  // loudly instead of silently.
  it("the capture ends on a NON-carrier, which is what makes this test able to fail", () => {
    const chars = statusCharacteristics(text);
    expect(chars.length).toBeGreaterThan(100);
    const last = chars.at(-1);
    expect(last).toBe("ce060033");
    expect(CARRIERS.has(last as string)).toBe(false);
    // And a carrier really did speak earlier, or there would be nothing to
    // erase and the test would be vacuous in the other direction.
    expect(chars.some((c) => CARRIERS.has(c))).toBe(true);
  });

  it(
    "the exported header reads 0 (RowErg), not null",
    { timeout: 30_000 },
    async () => {
      const parsed = parseRecording(text);
      // The recording's tx frames are BARRIERS: the engine holds until the
      // driver writes. This test never programs anything — it is about the
      // ORDER status frames decode in, not about programming — so the
      // barriers are released immediately rather than transcribing a program
      // to satisfy them. The divergences that produces are expected and
      // irrelevant here; every rx frame is still delivered, which is the only
      // thing this assertion rests on (and the sibling test above proves the
      // stream really did carry a carrier and end on a non-carrier).
      const replay = createReplayTransport(parsed, { barrierTimeoutMs: 1 });
      const [dev] = await replay.transport.scan();
      await replay.transport.connect(dev.id);

      const log = createEventLog();
      createSubscribedDriver(replay.transport, log, {
        deviceName: dev.name,
        now: () => replay.clock.now(),
        schedule: (cb, ms) => replay.clock.schedule(cb, ms),
      });
      await replay.run();

      // The wire byte is 0 at 0x0032 offset 16 on all 174 frames, and 0 is
      // ERGMACHINE_TYPE_STATIC_D — a rower, so nothing is refused and the
      // header is the only place the reading can show up.
      expect(log.meta().ergMachineType).toBe(0);
      // And the vendor's own token for it, so a human reading the exported
      // header does not have to look `0` up. `STATIC_D` is Model D, static —
      // NOT the word "row", which the vendor never uses for any value.
      expect(log.meta().ergMachineName).toBe("STATIC_D");
    },
  );
});
