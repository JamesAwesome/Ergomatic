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

  it("rejects empty input", () => {
    expect(() => parseRecording("")).toThrow(/not a pm5 recording/);
  });

  it("rejects input whose header line is not valid JSON", () => {
    expect(() => parseRecording("not json at all\n")).toThrow(
      /not a pm5 recording/,
    );
  });

  // Phase LM Task 4: the format carries app-lifecycle transitions now, so a
  // recording can say "the app went away here / came back here" and a desk
  // replay can drive the class of defect that enters above the wire.
  it("carries a lifecycle transition through serialize/parse, alongside the wire events", () => {
    const withLifecycle = [
      { seq: 0, t: 0, kind: "connect", id: "dev-1" } as const,
      { seq: 1, t: 12, dir: "rx", char: "0031", hex: "00 01" } as const,
      { seq: 2, t: 40, kind: "lifecycle", event: "background" } as const,
      { seq: 3, t: 900, kind: "lifecycle", event: "foreground" } as const,
    ];
    const parsed = parseRecording(serializeRecording(header, withLifecycle));
    expect(parsed.events).toStrictEqual(withLifecycle);
  });

  // BACK-COMPATIBILITY, stated as a test rather than as a comment: the
  // `lifecycle` member is additive inside `pm5-recording/v1`. A file written
  // before it existed carries no such line and must parse to exactly what it
  // always did — which is why the tag was NOT bumped (a bump makes
  // `parseRecording` reject every committed capture in
  // `docs/monitor/sessions/`). The committed-file end of this is
  // `lifecycleReplay.test.ts`, which replays a real capture from three days
  // before the member existed and asserts zero divergences.
  it("a recording with no lifecycle line parses exactly as before — the tag is still v1", () => {
    const text = serializeRecording(header, [...events]);
    const parsed = parseRecording(text);
    expect(parsed.header.v).toBe(RECORDING_FORMAT_TAG);
    expect(parsed.events).toStrictEqual(events);
    expect(
      parsed.events.some((e) => "kind" in e && e.kind === "lifecycle"),
    ).toBe(false);
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

// C1 fix (final-review): `holdOpen.ts` composes OUTSIDE this tap
// (`createHoldOpenTransport(tap.transport, …)`, `transports/index.ts`'s own
// composition) and needs to reach `webBluetooth.ts`'s NEW
// `onCharacteristicDegraded` structural extension THROUGH `tap.transport` —
// without the `...inner` spread this tap's own transport object now opens
// with (same idiom `liveness.ts` already established), that extension would
// be silently dropped here, one layer under `holdOpen.ts`'s own
// `hasCharacteristicDegraded(inner)` check, and the C1 fix would never
// reach the web arm it exists for.
describe("createRecordingTransport: structural extensions pass through unchanged", () => {
  it("a structural extension on inner (onCharacteristicDegraded) is reachable on tap.transport, forwarded via the ...inner spread", () => {
    const inner = stubInner();
    // A mutable holder object rather than a bare reassigned `let` — the
    // captured reference below is what proves this is the REAL
    // underlying callback, not a stub that merely type-checks.
    const captured: {
      cb: ((characteristicId: string, message: string) => void) | null;
    } = { cb: null };
    const innerWithExtension = {
      ...inner.transport,
      onCharacteristicDegraded(
        cb: (characteristicId: string, message: string) => void,
      ) {
        captured.cb = cb;
        return () => {
          if (captured.cb === cb) captured.cb = null;
        };
      },
    };

    const tap = createRecordingTransport(innerWithExtension);
    const forwarded = tap.transport as typeof innerWithExtension;

    expect(typeof forwarded.onCharacteristicDegraded).toBe("function");
    const seen: [string, string][] = [];
    forwarded.onCharacteristicDegraded((characteristicId, message) =>
      seen.push([characteristicId, message]),
    );
    // Firing through the captured reference reaches the listener
    // registered through `tap.transport` — proof the spread forwarded the
    // SAME function, not a copy.
    captured.cb?.("ce06003f-...", "NotFoundError");
    expect(seen).toStrictEqual([["ce06003f-...", "NotFoundError"]]);
  });

  it("the six explicit methods still OVERRIDE the spread — subscribe() is the tap's own multiplexing version, not inner's raw one", () => {
    const inner = stubInner();
    const tap = createRecordingTransport(inner.transport);
    const cb1 = () => undefined;
    const cb2 = () => undefined;

    tap.transport.subscribe("0031", cb1);
    tap.transport.subscribe("0031", cb2);

    // The tap's own fan-out behaviour (one inner subscription, many outer
    // callbacks) — if the spread had somehow won over the explicit method,
    // this would double-subscribe on `inner` instead.
    expect(inner.innerSubscriberCount("0031")).toBe(1);
  });
});
