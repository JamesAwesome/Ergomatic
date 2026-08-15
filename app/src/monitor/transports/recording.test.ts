import { describe, expect, it } from "vitest";
import type { Transport } from "../../../domain/monitor/types.js";
import {
  RECORDING_FORMAT_TAG,
  buildRecordingFile,
  createRecordingTransport,
  fromHexString,
  parseRecording,
  serializeRecording,
  toHexString,
} from "./recording";

describe("hex helpers", () => {
  it("round-trips bytes through the repo's space-separated lowercase style", () => {
    const bytes = new Uint8Array([0xf1, 0x76, 0x04, 0x00, 0xff]);
    const hex = toHexString(bytes);
    expect(hex).toBe("f1 76 04 00 ff");
    expect(Array.from(fromHexString(hex))).toStrictEqual(Array.from(bytes));
  });

  it("round-trips an empty byte array through hex", () => {
    const empty = new Uint8Array([]);
    const hex = toHexString(empty);
    expect(hex).toBe("");
    expect(Array.from(fromHexString(hex))).toStrictEqual(Array.from(empty));
  });
});

describe("recording serialization", () => {
  const header = {
    v: RECORDING_FORMAT_TAG,
    app: "v0.9.0-12-gabc1234",
    transport: "web",
  } as const;
  const events = [
    { seq: 0, t: 0, kind: "connect", id: "dev-1" } as const,
    { seq: 1, t: 12, dir: "rx", char: "0031", hex: "00 01" } as const,
  ];

  it("round-trips header and events through JSONL", () => {
    const text = serializeRecording(header, [...events]);
    const parsed = parseRecording(text);
    expect(parsed.header).toStrictEqual(header);
    expect(parsed.events).toStrictEqual(events);
  });

  it("puts the format tag on the first line so the gzipped file is identifiable from its head", () => {
    const text = serializeRecording(header, [...events]);
    expect(text.split("\n")[0]).toContain(RECORDING_FORMAT_TAG);
  });

  it("rejects text whose first line is not a recording header", () => {
    expect(() => parseRecording('{"seq":0}\n')).toThrow(/not a pm5 recording/);
  });
});

/** A bare hand-rolled `Transport` for the tap's own edge cases — pattern
 *  matches `driver.test.ts`'s `stubTransport`: direct control over exactly
 *  what's subscribed/notified, independent of a real radio or the fake. */
function stubInner() {
  const subs = new Map<string, Set<(bytes: Uint8Array) => void>>();
  const writes: { char: string; bytes: Uint8Array }[] = [];
  let dropCb: ((reason: string) => void) | null = null;
  return {
    transport: {
      scan: async () => [{ id: "dev-1", name: "PM5 432331249" }],
      connect: async () => {},
      write: async (char: string, bytes: Uint8Array) => {
        writes.push({ char, bytes });
      },
      subscribe: (char: string, cb: (b: Uint8Array) => void) => {
        if (!subs.has(char)) subs.set(char, new Set());
        subs.get(char)!.add(cb);
        return () => subs.get(char)!.delete(cb);
      },
      disconnect: async () => {},
      onDisconnect: (cb: (r: string) => void) => {
        dropCb = cb;
        return () => {
          dropCb = null;
        };
      },
    } satisfies Transport,
    notify(char: string, bytes: Uint8Array) {
      subs.get(char)?.forEach((cb) => cb(bytes));
    },
    innerSubscriberCount: (char: string) => subs.get(char)?.size ?? 0,
    fireDrop: (r: string) => dropCb?.(r),
    writes,
  };
}

describe("createRecordingTransport", () => {
  it("double-subscribe records once and delivers to both callbacks", () => {
    const inner = stubInner();
    const tap = createRecordingTransport(inner.transport);

    const received1: Uint8Array[] = [];
    const received2: Uint8Array[] = [];
    tap.transport.subscribe("0031", (b) => received1.push(b));
    tap.transport.subscribe("0031", (b) => received2.push(b));

    const bytes = new Uint8Array([0x01, 0x02]);
    inner.notify("0031", bytes);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    const rxEvents = tap
      .events()
      .filter((e) => "dir" in e && e.dir === "rx" && e.char === "0031");
    expect(rxEvents).toHaveLength(1);
    expect(inner.innerSubscriberCount("0031")).toBe(1);
  });

  it("unsubscribe: one of two callbacks leaves the other receiving; the last unsubscribe releases the inner subscription", () => {
    const inner = stubInner();
    const tap = createRecordingTransport(inner.transport);

    const received1: Uint8Array[] = [];
    const received2: Uint8Array[] = [];
    const unsubscribe1 = tap.transport.subscribe("0031", (b) =>
      received1.push(b),
    );
    const unsubscribe2 = tap.transport.subscribe("0031", (b) =>
      received2.push(b),
    );

    unsubscribe1();
    unsubscribe1(); // repeat unsubscribe is a no-op, not a second record

    inner.notify("0031", new Uint8Array([0x09]));
    expect(received1).toHaveLength(0);
    expect(received2).toHaveLength(1);
    expect(inner.innerSubscriberCount("0031")).toBe(1);

    unsubscribe2();
    expect(inner.innerSubscriberCount("0031")).toBe(0);

    inner.notify("0031", new Uint8Array([0x0a]));
    expect(received2).toHaveLength(1); // no delivery once inner is released

    const unsubscribeEvents = tap
      .events()
      .filter((e) => "kind" in e && e.kind === "unsubscribe");
    expect(unsubscribeEvents).toHaveLength(2);
    expect(tap.eventCount()).toBe(tap.events().length);
  });

  it("records a write with its bytes and characteristic", async () => {
    const inner = stubInner();
    const tap = createRecordingTransport(inner.transport, () => 0);

    await tap.transport.write("0021", new Uint8Array([0xf1, 0xf2]));

    expect(inner.writes).toStrictEqual([
      { char: "0021", bytes: new Uint8Array([0xf1, 0xf2]) },
    ]);
    const txEvents = tap.events().filter((e) => "dir" in e && e.dir === "tx");
    expect(txEvents).toStrictEqual([
      { seq: 0, t: 0, dir: "tx", char: "0021", hex: "f1 f2" },
    ]);
  });

  it("derives t from an injected clock, monotone from tap creation", () => {
    const inner = stubInner();
    let clock = 100;
    const tap = createRecordingTransport(inner.transport, () => clock);

    tap.transport.subscribe("0031", () => {});
    clock = 250;
    inner.notify("0031", new Uint8Array([0x00]));

    const rxEvents = tap.events().filter((e) => "dir" in e && e.dir === "rx");
    expect(rxEvents.map((e) => e.t)).toStrictEqual([150]);
    const subscribeEvents = tap
      .events()
      .filter((e) => "kind" in e && e.kind === "subscribe");
    expect(subscribeEvents.map((e) => e.t)).toStrictEqual([0]);
  });

  it("records handshake events in order with sequential seq", async () => {
    const inner = stubInner();
    const tap = createRecordingTransport(inner.transport);

    await tap.transport.scan();
    await tap.transport.connect("dev-1");
    await tap.transport.disconnect();

    const events = tap.events();
    expect(events.map((e) => ("kind" in e ? e.kind : e.dir))).toStrictEqual([
      "scan",
      "connect",
      "disconnect",
    ]);
    expect(events.map((e) => e.seq)).toStrictEqual([0, 1, 2]);
    expect(events[0]).toMatchObject({
      kind: "scan",
      devices: [{ id: "dev-1", name: "PM5 432331249" }],
    });
  });

  it("records a link drop and still propagates it to the caller", () => {
    const inner = stubInner();
    const tap = createRecordingTransport(inner.transport);

    let firedReason: string | null = null;
    tap.transport.onDisconnect((r) => {
      firedReason = r;
    });
    inner.fireDrop("gatt gone");

    expect(firedReason).toBe("gatt gone");
    expect(tap.events()).toContainEqual(
      expect.objectContaining({ kind: "link-drop", reason: "gatt gone" }),
    );
  });

  it("buildRecordingFile output parses back to the tap's own events", async () => {
    const inner = stubInner();
    const tap = createRecordingTransport(inner.transport);

    await tap.transport.connect("dev-1");
    tap.transport.subscribe("0031", () => {});
    inner.notify("0031", new Uint8Array([0x00, 0x01]));

    const text = buildRecordingFile(tap, { app: "x", transport: "web" });
    const parsed = parseRecording(text);

    expect(parsed.header.v).toBe(RECORDING_FORMAT_TAG);
    expect(parsed.events).toStrictEqual(tap.events());
  });
});
