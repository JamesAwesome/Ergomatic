import type { WorkoutProgram } from "../../../domain/monitor/program.js";

export const RECORDING_FORMAT_TAG = "pm5-recording/v1";

export interface RecordingHeader {
  v: typeof RECORDING_FORMAT_TAG;
  app: string;
  transport: "web" | "capacitor" | "fake";
  ua?: string;
  program?: WorkoutProgram;
}

export type RecordedEvent =
  | {
      seq: number;
      t: number;
      kind: "scan";
      devices: { id: string; name: string }[];
    }
  | { seq: number; t: number; kind: "connect"; id: string }
  | { seq: number; t: number; kind: "subscribe"; char: string }
  | { seq: number; t: number; kind: "unsubscribe"; char: string }
  | { seq: number; t: number; kind: "disconnect" }
  | { seq: number; t: number; kind: "link-drop"; reason: string }
  | { seq: number; t: number; dir: "tx"; char: string; hex: string }
  | { seq: number; t: number; dir: "rx"; char: string; hex: string };

export interface ParsedRecording {
  header: RecordingHeader;
  events: RecordedEvent[];
}

export function toHexString(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export function fromHexString(hex: string): Uint8Array {
  if (hex.length === 0) {
    return new Uint8Array([]);
  }
  const bytes = hex.split(" ").map((h) => parseInt(h, 16));
  return new Uint8Array(bytes);
}

export function serializeRecording(
  header: RecordingHeader,
  events: RecordedEvent[],
): string {
  const lines = [
    JSON.stringify(header),
    ...events.map((e) => JSON.stringify(e)),
  ];
  return lines.join("\n") + "\n";
}

export function parseRecording(text: string): ParsedRecording {
  const lines = text.split("\n").filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("not a pm5 recording");
  }

  let header: RecordingHeader;
  try {
    header = JSON.parse(lines[0]);
  } catch {
    throw new Error("not a pm5 recording");
  }

  if (header.v !== RECORDING_FORMAT_TAG) {
    throw new Error("not a pm5 recording");
  }

  const events: RecordedEvent[] = lines
    .slice(1)
    .map((line) => JSON.parse(line));

  return { header, events };
}
