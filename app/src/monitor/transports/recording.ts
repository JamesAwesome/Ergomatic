import type { WorkoutProgram } from "../../../domain/monitor/program.js";
import type { Transport } from "../../../domain/monitor/types.js";

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

/** `Omit` applied per union member (plain `Omit` on a discriminated union
 *  collapses to the members' common keys) — so a caller building a `scan`
 *  event still gets `devices` required and a `tx` event still gets `char`
 *  and `hex` required, with only `seq`/`t` dropped from each. */
type RecordedEventInput<E = RecordedEvent> = E extends RecordedEvent
  ? Omit<E, "seq" | "t">
  : never;

export interface RecordingTap {
  /** Hand this to the driver/session in place of the real transport. */
  transport: Transport;
  /** Serialized event lines (no header), snapshot at call time. */
  lines(): string[];
  events(): RecordedEvent[];
  eventCount(): number;
}

/**
 * Wraps `inner` so every scan/connect/write/subscribe/unsubscribe/
 * disconnect/link-drop is recorded, with no decoding and no filtering.
 *
 * M1 (per-characteristic single recording): the real driver subscribes to
 * the same characteristic more than once (`driver.ts`'s raw General Status
 * tick-counter subscribe alongside `mergeStatus`'s own). This tap keeps its
 * own per-characteristic subscriber list, subscribes to `inner` exactly
 * ONCE per characteristic (on that characteristic's first subscriber), and
 * records each inbound notification exactly once at that single inner
 * subscription before fanning it out to every one of its own subscribers.
 * The last unsubscribe for a characteristic releases the inner
 * subscription so a later re-subscribe re-establishes it.
 */
export function createRecordingTransport(
  inner: Transport,
  now: () => number = () => performance.now(),
): RecordingTap {
  const t0 = now();
  const events: RecordedEvent[] = [];
  let seq = 0;

  function record(partial: RecordedEventInput): void {
    events.push({ seq: seq++, t: now() - t0, ...partial } as RecordedEvent);
  }

  // Per-characteristic fan-out: `outerSubs` holds every caller callback for
  // a characteristic; `innerUnsubscribe` holds the single unsubscribe for
  // `inner`, present only while `outerSubs` for that characteristic is
  // non-empty.
  const outerSubs = new Map<string, Set<(bytes: Uint8Array) => void>>();
  const innerUnsubscribe = new Map<string, () => void>();

  const transport: Transport = {
    async scan() {
      const devices = await inner.scan();
      record({ kind: "scan", devices });
      return devices;
    },
    async connect(id) {
      await inner.connect(id);
      record({ kind: "connect", id });
    },
    async write(characteristicId, bytes) {
      await inner.write(characteristicId, bytes);
      record({ dir: "tx", char: characteristicId, hex: toHexString(bytes) });
    },
    subscribe(characteristicId, cb) {
      let set = outerSubs.get(characteristicId);
      if (!set) {
        set = new Set();
        outerSubs.set(characteristicId, set);
      }
      set.add(cb);
      record({ kind: "subscribe", char: characteristicId });

      if (!innerUnsubscribe.has(characteristicId)) {
        const unsubscribeInner = inner.subscribe(characteristicId, (bytes) => {
          record({
            dir: "rx",
            char: characteristicId,
            hex: toHexString(bytes),
          });
          for (const outerCb of outerSubs.get(characteristicId) ?? []) {
            outerCb(bytes);
          }
        });
        innerUnsubscribe.set(characteristicId, unsubscribeInner);
      }

      return () => {
        const currentSet = outerSubs.get(characteristicId);
        if (!currentSet || !currentSet.has(cb)) {
          return;
        }
        currentSet.delete(cb);
        record({ kind: "unsubscribe", char: characteristicId });
        if (currentSet.size === 0) {
          outerSubs.delete(characteristicId);
          innerUnsubscribe.get(characteristicId)?.();
          innerUnsubscribe.delete(characteristicId);
        }
      };
    },
    async disconnect() {
      await inner.disconnect();
      record({ kind: "disconnect" });
    },
    onDisconnect(cb) {
      return inner.onDisconnect((reason) => {
        record({ kind: "link-drop", reason });
        cb(reason);
      });
    },
  };

  return {
    transport,
    lines: () => events.map((event) => JSON.stringify(event)),
    events: () => [...events],
    eventCount: () => events.length,
  };
}

/** Full JSONL recording file: header line + the tap's event lines. */
export function buildRecordingFile(
  tap: Pick<RecordingTap, "lines">,
  header: Omit<RecordingHeader, "v">,
): string {
  const lines = [
    JSON.stringify({ v: RECORDING_FORMAT_TAG, ...header }),
    ...tap.lines(),
  ];
  return lines.join("\n") + "\n";
}

/**
 * Composes a tap's recording and hands it to the browser as a download.
 * Lives HERE — inside `recording.ts`, reached only through
 * `transports/index.ts`'s `fakeMonitorEnabled`-gated dynamic `import()`,
 * the same build-time-foldable seam `createRecordingTransport` already sits
 * behind — and NOT in `ConnectionLogSheet.tsx` (fix round: a dynamic
 * `import()` whose only guard is a RUNTIME presence check, e.g.
 * `window.__pm5Recording__`, still emits this module's whole graph as its
 * own chunk on disk; Rollup can only drop an `import()` call site behind a
 * condition it can fold at BUILD time, which a runtime value never is).
 * `window.__pm5Recording__.download` is a closure over this function plus
 * the one live tap — see `transports/index.ts`'s own `declare global`
 * comment for the wiring.
 *
 * `app: "dev"` is a literal, not a build arg — this repo has no
 * `VITE_APP_VERSION` (confirmed absent, task-6 brief). Feature-detects BOTH
 * `CompressionStream` and `Blob.prototype.stream` (not just the former):
 * under this file's own test suite (Node 26 + jsdom), Node's global
 * `CompressionStream` leaks through unshadowed, but jsdom's `Blob` polyfill
 * has no `.stream()` — checking `CompressionStream` alone reads as
 * "supported" and then throws. Every real evergreen browser ships both
 * together, so production behavior is unaffected; the second check is what
 * actually keeps a test run on the plain-`.jsonl` fallback path exercised
 * below.
 */
export async function downloadRecording(
  tap: Pick<RecordingTap, "lines">,
  program: WorkoutProgram,
): Promise<void> {
  const text = buildRecordingFile(tap, {
    app: "dev",
    transport: "web",
    ua: navigator.userAgent,
    program,
  });
  const canCompress =
    typeof CompressionStream !== "undefined" &&
    typeof Blob.prototype.stream === "function";
  const gz = canCompress
    ? await new Response(
        new Blob([text]).stream().pipeThrough(new CompressionStream("gzip")),
      ).blob()
    : new Blob([text]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(gz);
  a.download = `pm5-recording-${Date.now()}.jsonl${canCompress ? ".gz" : ""}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
