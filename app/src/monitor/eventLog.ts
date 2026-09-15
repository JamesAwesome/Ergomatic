import type { ErgMachineToken } from "../../domain/monitor/pm5/ergMachine.js";
import { APP_VERSION } from "../appVersion";
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

/** The grounding a pasted log needs to be reviewable at all.
 *
 *  WHY THIS EXISTS. The export used to be `JSON.stringify(entries)` — a bare
 *  array saying what happened and nothing about where. A tester's paste could
 *  not name the monitor, the build, or which of three stashed sessions it
 *  was, so a report like "it behaved oddly on my erg" was unfalsifiable from
 *  the bytes. Every field below except `appVersion` already existed somewhere
 *  in the app at export time and simply never reached the clipboard.
 *
 *  EVERY FIELD IS OPTIONAL EXCEPT `appVersion`, and deliberately: they arrive
 *  at different moments (`deviceName` at connect, `ergMachineType` only once
 *  a frame has decoded, `sessionId` at the mint), and a log exported before
 *  one of them is known must still export. */
export interface MonitorLogMeta {
  /** The build that produced this log — `src/appVersion.ts`. Always present:
   *  a log that cannot name its own build is the gap that makes two
   *  TestFlight pastes indistinguishable. */
  appVersion: string;
  /** The logical session's id, so three stashed pastes can be told apart —
   *  and so a Try-again that replaced the ring is DETECTABLE rather than
   *  silent. */
  sessionId?: string;
  /** The monitor's advertised BLE name, e.g. `PM5 432331249`. `null` when the
   *  device advertised none; absent when no connect has happened yet. */
  deviceName?: string | null;
  /** The decoded `ergMachineType`, on EVERY path — not only refusals. Before
   *  this, a RowErg and a pre-2018 monitor with no field at all were
   *  indistinguishable in a log, because only the refusal recorded anything. */
  ergMachineType?: number | null;
  /** The VENDOR's own token for that value (`STATIC_D`, `MULTIERG_ROW`) —
   *  absent when the vendor names none, and never a fallback, because
   *  naming an unnamed value as rowing is the allowlist `ergMachine.ts`'s
   *  denylist exists to refuse. Written in LOCKSTEP with `ergMachineType`
   *  and only ever from the same reading, so the pair cannot disagree: a
   *  header saying `0` beside `MULTIERG_SKI` would be worse than either
   *  alone. The token carries no support semantics — whether a machine is
   *  ALLOWED is the `unsupported-machine` event's business.
   *
   *  Typed as the union, not `string`: the union exists so a mistyped token
   *  cannot compile, and dropping it at the one boundary that PERSISTS would
   *  be the only place the guarantee mattered.
   *
   *  And yes, this is a value derived from `ergMachineType` beside it, which
   *  is the shadow-of-a-truth shape `driver.ts` rejects a driver-scoped flag
   *  for. The difference is drift: this token is computed once and frozen
   *  with the reading that produced it, so it cannot diverge from its source
   *  — a live flag's two copies are written at different moments and can.
   *  Said here because a reader finds the inconsistency before the
   *  reconciliation. */
  ergMachineName?: ErgMachineToken;
}

export interface MonitorEventLog {
  record(kind: string, detail: string): void;
  entries(): MonitorLogEntry[];
  /** Merges a patch into the export header. Called more than once per
   *  session, as each fact becomes known; later patches never erase earlier
   *  ones. */
  setMeta(patch: Partial<Omit<MonitorLogMeta, "appVersion">>): void;
  meta(): MonitorLogMeta;
  exportLog(): string;
}

/** What `exportLog()` serializes. Readers must accept BOTH this and the bare
 *  array older builds wrote — see `parseLog` in
 *  `workout/connected/ConnectionLogSheet.tsx`. */
export interface MonitorLogExport {
  meta: MonitorLogMeta;
  entries: MonitorLogEntry[];
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
/**
 * One reader for BOTH export shapes, so nothing else has to know there are
 * two.
 *
 * Since the grounding header landed, `exportLog()` writes
 * `{meta, entries}`. A stash written by an OLDER build is a BARE ARRAY —
 * and those outlive the upgrade, because `ergomatic:session-log-history`
 * lives in `localStorage`. A reader that accepted only the new shape would
 * render every log a rower already had as "no events", turning the
 * diagnostics door blank at exactly the moment they upgraded to get better
 * diagnostics.
 *
 * Anything unparseable reads as an empty log rather than throwing: every
 * caller is a surface that exists because something already went wrong, and
 * none of them may be the thing that breaks.
 */
export function parseLogExport(raw: string): MonitorLogExport {
  return (
    tryParseLogExport(raw) ?? { meta: { appVersion: "unknown" }, entries: [] }
  );
}

/**
 * As `parseLogExport`, but tells UNREADABLE apart from EMPTY.
 *
 * Most callers render a log and want the lenient version — an unreadable
 * stash and an empty one both draw "no events". One caller must not conflate
 * them: the hold-open instrument APPENDS to a stashed ring and writes it
 * back, and it has a standing rule that a malformed prior value is left
 * alone rather than overwritten with a partial write. Handing it an empty
 * log for unreadable bytes would destroy exactly what it promises to
 * preserve — which is a regression this function exists to prevent, caught
 * by `transports/index.test.ts`'s own malformed-prior test.
 */
export function tryParseLogExport(raw: string): MonitorLogExport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) {
    // The legacy shape. It names no build, and `"unknown"` says so rather
    // than guessing THIS build's version for bytes some older one wrote.
    return {
      meta: { appVersion: "unknown" },
      entries: parsed as MonitorLogEntry[],
    };
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as { meta?: unknown; entries?: unknown };
  if (!Array.isArray(obj.entries)) return null;
  const meta =
    typeof obj.meta === "object" && obj.meta !== null
      ? (obj.meta as MonitorLogMeta)
      : { appVersion: "unknown" };
  return { meta, entries: obj.entries as MonitorLogEntry[] };
}

export function createEventLog(
  capacity: number = DEFAULT_CAPACITY,
  now: () => number = () => Date.now(),
): MonitorEventLog {
  let entries: MonitorLogEntry[] = [];
  let nextSeq = 0;
  let meta: MonitorLogMeta = { appVersion: APP_VERSION };

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
    setMeta(patch: Partial<Omit<MonitorLogMeta, "appVersion">>): void {
      // MERGE, never replace: the fields arrive at different moments and a
      // later patch must not erase an earlier one. `appVersion` is omitted
      // from the patch type because no caller may overwrite the build stamp.
      meta = { ...meta, ...patch };
    },
    meta(): MonitorLogMeta {
      return { ...meta };
    },
    exportLog(): string {
      // DETERMINISTIC: the same log exports the same bytes every time.
      // An `exportedAt` stamp lived here briefly and was removed — it made
      // `exportLog()` non-idempotent, which broke the invariant that the
      // hook's export is byte-identical to the log's (the sheet's COPY LOG
      // copies whatever the hook returns, verbatim). It also bought little:
      // the history entry already carries `savedAt`, and the last entry's
      // own `atMs` says when the session ended, which is the more useful
      // fact than when somebody pressed copy.
      const payload: MonitorLogExport = { meta, entries };
      return JSON.stringify(payload);
    },
  };
}
