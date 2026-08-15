import { describe, expect, it } from "vitest";
import {
  RECORDING_FORMAT_TAG,
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
