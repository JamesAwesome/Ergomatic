// The monitor seam: the normalized types every consumer above the PM5 codec
// sees, plus the radio abstraction the driver (a later task) is built
// against. Nothing below this file's Transport/DiscoveredMonitor pair is
// PM5-specific — `pm5/` translates the wire into these shapes; a second
// monitor brand would enter through the same seam.
//
// MonitorCapabilities/MonitorFrame/IntervalActual/MonitorEvent/MonitorDriver
// are the design spec's §2 block, reproduced field-for-field (names, types,
// order, and the reasoning in each comment) —
// docs/superpowers/specs/2026-08-05-phase-7a-monitor-domain-design.md §2.
//
// domain/monitor/** imports nothing from src/.

import type { WorkoutProgram } from "./program.js";

export interface MonitorCapabilities {
  canProgram: boolean;
  hasStrokeRate: boolean;
  reportsIntervals: boolean;
  deviceName: string;
  // NOTE: heart rate is NOT here — belt presence is only knowable from
  // the data stream (frames carry hr: number | null per frame). A
  // static hasHeartRate would lie; the grid's `—` renders from the
  // frame, not from capabilities.
}

export interface MonitorFrame {
  elapsedSeconds: number;
  distanceMeters: number;
  currentSplit: number | null;
  spm: number | null;
  heartRateBpm: number | null; // null = no belt data THIS frame
  intervalIndex: number | null;
  intervalRemaining: { kind: "time" | "distance"; value: number } | null;
  // ^ COMPUTED by the driver (program value minus quantized progress) —
  //   rev 1.30 has no "remaining" field on any characteristic (H3).
  //   Display cadence: the sample-rate characteristic (0x0034) is
  //   written to its fastest documented rate at connect; the default
  //   500 ms is too coarse for a countdown.
  state: "idle" | "armed" | "rowing" | "resting" | "finished" | "terminated";
  // ^ maps the PM's WORKOUTSTATE honestly: "armed" = WAITTOBEGIN (the
  //   PM starts on the first stroke — there is NO start command;
  //   SET_STARTTYPE is <Not implemented> in rev 0.27). There is NO
  //   paused state on the wire — mid-workout the clock runs whether or
  //   not the rower pulls (C4/H1). "finished" = WORKOUTEND;
  //   "terminated" = TERMINATE — distinct, because 7C must tell
  //   "logged 12 of 12" from "abandoned at 8" (H2).
}

export interface IntervalActual {
  index: number;
  elapsedSeconds: number;
  distanceMeters: number;
  avgSplit: number | null;
  avgSpm: number | null;
  avgHeartRateBpm: number | null;
}

export type MonitorEvent =
  | { kind: "frame"; frame: MonitorFrame }
  | { kind: "armed" } // programming done, PM waits for stroke one
  | { kind: "intervalComplete"; actual: IntervalActual }
  | { kind: "workoutComplete" }
  | { kind: "terminated" }
  | { kind: "disconnected"; reason: string }
  | { kind: "reconnected" };

export interface MonitorDriver {
  readonly capabilities: MonitorCapabilities;
  program(p: WorkoutProgram): Promise<void>; // multi-frame, ack-gated (§3); typed ProgramRejection
  terminate(): Promise<void>; // the documented terminate command — no start() exists
  events: (cb: (e: MonitorEvent) => void) => () => void;
  disconnect(): Promise<void>;
}

// --- Transport (this file's own design — the spec names the method set,
// "scan/connect/write/subscribe/disconnect/onDisconnect" (design spec §4),
// but does not give a code block for it the way §2 does; the review that
// found the C1/M2 gaps cites `Transport.write(charId, bytes)` and
// `Transport.subscribe(charId, cb)` by shorthand, not verbatim either). ---

/** A monitor found by `Transport.scan()`, before connecting. */
export interface DiscoveredMonitor {
  /** Transport-specific identifier passed back into `Transport.connect` —
   *  a Web Bluetooth device id, or a Capacitor BLE peripheral id. Never a
   *  MAC address (iOS never exposes one to web/hybrid apps) — no caller
   *  may assume this string has any particular shape. */
  id: string;
  /** Advertised device name (e.g. "PM5 12345") — display only. */
  name: string;
}

/**
 * The radio abstraction every implementation (the fake, `webBluetooth.ts`,
 * `capacitorBle.ts` — all later tasks) satisfies. `pm5/commands.ts` already
 * chunks CSAFE frames to the BLE write budget (framer.ts's `chunkFrames`,
 * <=20 bytes) and `pm5/framer.ts`'s `reassemble()` already un-chunks
 * response bytes back into frames — `Transport` itself moves raw bytes only
 * and knows nothing about CSAFE, ack-gating, or the PM5 at all (that
 * knowledge lives in the driver, a later task, and in `pm5/`).
 */
export interface Transport {
  scan(): Promise<DiscoveredMonitor[]>;
  connect(id: string): Promise<void>;
  /** One BLE write to `characteristicId`. `bytes` is already sized to the
   *  BLE write budget by the caller (framer.ts's `chunkFrames`) — this
   *  method does not further split or validate length. */
  write(characteristicId: string, bytes: Uint8Array): Promise<void>;
  /** Subscribes to notifications on `characteristicId`; returns an
   *  unsubscribe function. `cb` receives raw notification bytes exactly as
   *  delivered by the radio, one BLE notification per call — reassembling
   *  multi-chunk CSAFE responses is the caller's job (`pm5/framer.ts`'s
   *  `reassemble()`), not this interface's. */
  subscribe(
    characteristicId: string,
    cb: (bytes: Uint8Array) => void,
  ): () => void;
  /** Caller-initiated disconnect — distinct from an unexpected link drop,
   *  which arrives via `onDisconnect` instead. */
  disconnect(): Promise<void>;
  /** Registers a callback for an UNEXPECTED link drop (radio out of range,
   *  the phone's Bluetooth stack resetting, iOS backgrounding — see the
   *  design spec §4's iOS note) — never fired by a caller-initiated
   *  `disconnect()`. Returns an unsubscribe function. */
  onDisconnect(cb: (reason: string) => void): () => void;
}
