// Observability ring buffer for the monitor driver (design spec §5):
// injectable (the driver takes one as a constructor argument, never reaches
// for a module-level singleton), fixed capacity (default 500), JSON export.
//
// ORDERING is by an internal monotonic `seq` counter, never by the clock
// below — the 6B rule the briefing repeats ("no wall clock anywhere in
// tests") applies just as much to what this log RECORDS as to what drives a
// fake's timeline, and a sequence number is strictly more useful for
// `exportLog`'s job (reconstructing a session trace, design spec §7) than a
// timestamp for the same reason it always was: two entries recorded in the
// same microtask (e.g. a chunk write and its immediate synthetic ack from
// the fake) can carry the identical clock reading and lose their relative
// order; `seq` never collides.
//
// **`atMs` (Phase LL Task 1, link-truth design spec §1: "the ring gains a
// monotonic timestamp") is an ADDITIONAL, diagnostic-only field, not a
// second ordering axis.** Byte capture is structurally impossible on
// native, and the ring is the record there — a rower's own bug report
// needs to say WHEN a `liveness-silence` entry landed relative to the
// wall clock, not just its position in the sequence. `record()` stamps
// every entry from the log's own injected `now()` (optional, defaulting to
// `Date.now()` in production — the same default `useMonitorSession.ts`
// wires its own liveness clock to, so ring entries and the liveness
// decorator's own numbers read off one clock). A test that wants
// deterministic `atMs` values injects its own via `createEventLog`'s
// second parameter, same idiom as `capacity`. Optional on
// `MonitorLogEntry` itself (never absent from anything `record()`
// produces, but a stash written by an OLDER build — sessionStorage, not a
// migrated table — has no atMs at all, and `ConnectionLogSheet.tsx`'s
// `parseLogEntries` must keep accepting it rather than silently dropping
// every pre-Task-1 entry).

export interface MonitorLogEntry {
  seq: number;
  /** Wall-clock-ish milliseconds at the moment this entry was recorded,
   *  from the log's own injected `now()`. See this file's header for why
   *  it is diagnostic only, never the ordering authority, and why it is
   *  optional on the type despite `record()` always supplying one. */
  atMs?: number;
  kind: string;
  detail: string;
  /** How many CONSECUTIVE identical entries (same `kind` AND `detail`) this
   *  one stands for. Absent means one, exactly as it did before this field
   *  existed — additive-optional, the same shape `atMs` already takes, so an
   *  older stash and an older reader both keep working.
   *
   *  **This exists because a flood used to destroy its own diagnosis.** A
   *  monitor we cannot decode emits a `frame-error` per arrival, roughly
   *  eight a second; 500 of those fill the whole ring in about a minute and
   *  evict the `notify-first <char> (<n>B)` lines that record every
   *  characteristic's measured wire length — the single most useful thing in
   *  the file for that bug class. Measured 2026-09-07: a rower's export ran
   *  seq 5432 to 5931, exactly 500, every entry the same parse error, and the
   *  lines that would have said whether their OTHER characteristics were also
   *  short were already gone. Collapsing the run keeps the count AND the
   *  context. */
  repeated?: number;
  /** `atMs` of the LAST arrival in a collapsed run, so the span is readable
   *  (`atMs` stays the FIRST). Absent when `repeated` is. */
  lastAtMs?: number;
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
 *
 * `now` (Phase LL Task 1) stamps each entry's `atMs` — defaults to
 * `Date.now`, injectable so a test gets deterministic values the same way
 * `driver.ts`'s own `DriverOptions.now` is injectable, and so a replay
 * test can bind the SAME clock (`ReplayHandle.clock.now`) the liveness
 * decorator under test is using.
 */
export function createEventLog(
  capacity: number = DEFAULT_CAPACITY,
  now: () => number = () => Date.now(),
): MonitorEventLog {
  let entries: MonitorLogEntry[] = [];
  let nextSeq = 0;

  return {
    record(kind: string, detail: string): void {
      // COALESCE A CONSECUTIVE REPEAT rather than pushing it. See
      // `MonitorLogEntry.repeated` for the incident this exists for: a
      // high-frequency error path was evicting the connect-time entries that
      // diagnose it. `seq` deliberately does NOT advance here — it numbers
      // ENTRIES, and this entry now stands for `repeated` events, which the
      // field states explicitly rather than leaving to be inferred from gaps.
      //
      // Replaced, not mutated in place: `entries()` hands out a shallow copy,
      // so mutating the last object would retroactively change an array a
      // caller is already holding. Diagnostics that rewrite themselves under
      // a reader are worse than none.
      const last = entries[entries.length - 1];
      if (last !== undefined && last.kind === kind && last.detail === detail) {
        entries[entries.length - 1] = {
          ...last,
          repeated: (last.repeated ?? 1) + 1,
          lastAtMs: now(),
        };
        return;
      }
      entries.push({ seq: nextSeq, atMs: now(), kind, detail });
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
