// Observability ring buffer for the monitor driver (design spec §5):
// injectable (the driver takes one as a constructor argument, never reaches
// for a module-level singleton), fixed capacity (default 500), JSON export.
//
// No wall clock: entries are ordered by an internal monotonic `seq` counter,
// not `Date.now()` — the 6B rule the briefing repeats ("no wall clock
// anywhere in tests") applies just as much to what this log RECORDS as to
// what drives a fake's timeline. A sequence number is also strictly more
// useful for `exportLog`'s job (reconstructing a session trace, design spec
// §7) than a timestamp would be: two entries recorded in the same
// microtask (e.g. a chunk write and its immediate synthetic ack from the
// fake) would carry the identical `Date.now()` value and lose their
// relative order; `seq` never collides.

export interface MonitorLogEntry {
  seq: number;
  kind: string;
  detail: string;
}

export interface MonitorEventLog {
  record(kind: string, detail: string): void;
  entries(): MonitorLogEntry[];
  exportLog(): string;
}

/** Design spec §5: "500 entries". */
const DEFAULT_CAPACITY = 500;

/**
 * Creates an event log holding at most `capacity` entries (default 500) —
 * once full, the oldest entry is dropped as a new one is recorded (a true
 * ring, just implemented with a plain array rather than a head/tail index,
 * since `capacity` is small and `record` is not a hot loop). `entries()`
 * returns a defensive copy so a caller cannot mutate the log's internal
 * array; `exportLog()` is that same copy, JSON-serialized (design spec §5's
 * "exportLog JSON").
 */
export function createEventLog(
  capacity: number = DEFAULT_CAPACITY,
): MonitorEventLog {
  let entries: MonitorLogEntry[] = [];
  let nextSeq = 0;

  return {
    record(kind: string, detail: string): void {
      entries.push({ seq: nextSeq, kind, detail });
      nextSeq += 1;
      if (entries.length > capacity) {
        entries = entries.slice(entries.length - capacity);
      }
    },
    entries(): MonitorLogEntry[] {
      return entries.slice();
    },
    exportLog(): string {
      return JSON.stringify(entries);
    },
  };
}
