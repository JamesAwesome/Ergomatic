// Lifecycle design spec §2 ("The ring becomes readable and durable"): the
// single `ergomatic:last-session-log` slot (`useMonitorSession.ts`'s
// `stash()`, `LogSession.tsx`'s `readMonitorLogStash`) is perishable — one
// key, one slot — and it is exactly this perishability that destroyed the
// pocketed-phone ring: the log that would have proven or refuted §0.1's
// hypothesis was overwritten by the very next teardown, before anyone got a
// chance to read it. This module does not touch that key or its reader; it
// adds a THREE-ENTRY HISTORY beside it, additive, so the last three
// teardowns' exports all survive at once. Task 3 builds the ungated door
// that lists them; this module is read-and-write plumbing only.
//
// CLIENT-ONLY DIAGNOSTICS, not a record: same tier as `last-session-log`
// itself — losable (device storage can be cleared, denied, or full at any
// time) and never authoritative for anything the app computes. No `v:`
// field, no migration: the whole array is independently overwritten by
// rotation, never read across an app version boundary as a compatibility
// concern.
//
// STORAGE SHAPE — final whole-branch review, M-6 (atomic history storage):
// ONE key, `ergomatic:session-log-history`, holding
// `JSON.stringify({savedAt, exported}[])` — newest first, capped at
// `MAX_ENTRIES`. This REPLACES the original three-key `h1`/`h2`/`h3`
// rotation (never released — no legacy migration needed, and this header
// says so explicitly so a future reader doesn't go looking for one): that
// shape needed TWO separate `localStorage.setItem` calls per push (h2->h3,
// h1->h2) plus a third for the new h1, and a `setItem` that throws partway
// through the sequence (quota, private-mode eviction mid-rotation) could
// leave the three keys in a state no single rotation ever produces — a
// duplicated or lost entry, observed by the reviewer forcing failure on the
// MIDDLE write of a three-push sequence (E4, E2, E2 — the newest push's own
// export duplicated over what should have been the second-oldest slot).
// The new shape writes the ENTIRE history in one `setItem` call: either
// that call succeeds and the array on disk is the new one, whole, or it
// throws and the array on disk is whatever the LAST successful write left
// — never a partial rewrite of some entries and not others, because there
// is only ever one entry's worth of key to fail on. `exported` is opaque
// here — whatever `MonitorEventLog.exportLog()` produced, byte-identical,
// never re-serialized — so a rotation can never subtly change what a stash
// contains.
//
// Every export below follows `monitorRun.ts`'s "best-effort IO that never
// throws" discipline: a corrupt or unreadable stored value is treated as
// absent, not fatal, and a denied write is a silent no-op — same reason
// `stash()`'s own catch exists ("diagnostics never break a teardown").

const HISTORY_KEY = "ergomatic:session-log-history";
const MAX_ENTRIES = 3;

interface StoredEntry {
  savedAt: string;
  exported: string;
}

export interface SessionLogHistoryEntry {
  /** 1 = newest, derived from the entry's position in the stored array —
   *  no longer a literal key suffix now that the array shape holds one
   *  ordered list rather than three independently-addressed slots. */
  slot: 1 | 2 | 3;
  /** ISO timestamp written at rotation — the display "when". */
  savedAt: string;
  /** The ring's exported JSON, byte-identical to what teardown stashed. */
  exported: string;
}

/** M-7 (final whole-branch review): reject a `savedAt` that is well-formed
 *  JSON of the right SHAPE but not a value `Date.parse` can read — a
 *  corrupt/hand-edited string, or a shape a future writer gets wrong —
 *  rather than let it reach `MonitorLogs.tsx`'s `new Date(entry.savedAt)`
 *  and render the literal text "Invalid Date". Every other field-shape
 *  check below is a `typeof` guard; a value can pass every `typeof` guard
 *  and still fail this — `savedAt: "not-a-date"` is a `string`, so it needs
 *  its own check. `Number.isNaN(Date.parse(...))` is the same test the ECMA
 *  spec itself defines `Date`'s own parse failure as (a `NaN` time value),
 *  not a heuristic. */
function isValidSavedAt(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function isStoredEntry(value: unknown): value is StoredEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).savedAt === "string" &&
    isValidSavedAt((value as Record<string, unknown>).savedAt as string) &&
    typeof (value as Record<string, unknown>).exported === "string"
  );
}

/** Best-effort read of the whole history array. `[]` for absent, denied, or
 *  malformed storage, or a JSON value that parses but isn't an array —
 *  every one of those degrades to "no history", never a throw. Each
 *  ARRAY ELEMENT is independently validated: one corrupt entry (or one
 *  whose `savedAt` doesn't parse) is dropped, not fatal to its siblings —
 *  matching the old three-key shape's own "a corrupt slot is skipped, not
 *  fatal" contract. Over-length arrays (should not occur — every writer
 *  below caps at `MAX_ENTRIES` — but a hand-edited or future-version value
 *  is not this module's to trust) are trimmed to `MAX_ENTRIES` too. */
function readHistory(): StoredEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredEntry).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/** Best-effort write of the whole history array, ONE `setItem` call — the
 *  atomicity this module exists for (see the header). Silent no-op on
 *  denial (quota, privacy mode) — same discipline as `stash()`'s own catch.
 *  A denied write leaves whatever was ALREADY on disk untouched (the
 *  previous, successful write's own array) — never a partial rewrite,
 *  because there is nothing partial about a single call that either
 *  happens or doesn't. */
function writeHistory(entries: StoredEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Quota or privacy mode: diagnostics never break a teardown, and the
    // prior successful write (if any) survives untouched on disk.
  }
}

/** Rotates `exported` into the front of the history, newest-first, evicting
 *  past `MAX_ENTRIES`. Never throws. */
export function pushSessionLog(exported: string, savedAt: Date): void {
  const entry: StoredEntry = { savedAt: savedAt.toISOString(), exported };
  const next = [entry, ...readHistory()].slice(0, MAX_ENTRIES);
  writeHistory(next);
}

/** M-5 (final whole-branch review, item 1 — a burst-eligible teardown's
 *  SECOND stash must not consume a second history slot): overwrites the
 *  NEWEST entry in place with fresher bytes from the SAME teardown, rather
 *  than rotating a second time. `useMonitorSession.ts`'s `stash()` calls
 *  this (guarded by its own per-teardown ref, the same idiom
 *  `latchCountRecordedRef` already uses) on every stash after the first one
 *  THIS teardown has already run. Falls back to a plain push when the
 *  history is empty — defensive only: `stash()`'s own guard means this is
 *  never called before `pushSessionLog` has already run at least once in
 *  the same teardown, so the read here is expected to see at least one
 *  entry, but a genuinely empty history (e.g. the FIRST push itself denied
 *  its write) still has to end up with something recorded rather than
 *  silently doing nothing. */
export function updateNewestSessionLog(exported: string, savedAt: Date): void {
  const entry: StoredEntry = { savedAt: savedAt.toISOString(), exported };
  const existing = readHistory();
  const next = existing.length === 0 ? [entry] : [entry, ...existing.slice(1)];
  writeHistory(next.slice(0, MAX_ENTRIES));
}

/** Newest-first list of whatever entries exist. Never throws; a corrupt or
 *  denied entry is skipped, not fatal (see `readHistory`). `slot` is
 *  derived from array position, 1-indexed. */
export function listSessionLogs(): SessionLogHistoryEntry[] {
  return readHistory().map((entry, index) => ({
    slot: (index + 1) as 1 | 2 | 3,
    savedAt: entry.savedAt,
    exported: entry.exported,
  }));
}
