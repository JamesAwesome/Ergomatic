// Lifecycle design spec §2 ("The ring becomes readable and durable"): the
// single `ergomatic:last-session-log` slot (`useMonitorSession.ts`'s
// `stash()`, `LogSession.tsx`'s `readMonitorLogStash`) is perishable — one
// key, one slot — and it is exactly this perishability that destroyed the
// pocketed-phone ring: the log that would have proven or refuted §0.1's
// hypothesis was overwritten by the very next teardown, before anyone got a
// chance to read it. This module does not touch that key or its reader; it
// adds a THREE-SLOT HISTORY beside it, additive, so the last three teardowns'
// exports all survive at once. Task 3 builds the ungated door that lists
// them; this module is read-and-write plumbing only.
//
// CLIENT-ONLY DIAGNOSTICS, not a record: same tier as `last-session-log`
// itself — losable (device storage can be cleared, denied, or full at any
// time) and never authoritative for anything the app computes. No `v:`
// field, no migration: each slot is independently overwritten by rotation,
// never read across an app version boundary as a compatibility concern.
//
// Storage shape: three keys, `ergomatic:session-log-h1|h2|h3`, each holding
// `JSON.stringify({ savedAt: <ISO string>, exported: <ring JSON string> })`.
// Slot 1 is always newest. `exported` is opaque here — whatever
// `MonitorEventLog.exportLog()` produced, byte-identical, never
// re-serialized — so a rotation can never subtly change what a stash
// contains.
//
// Every export below follows `monitorRun.ts`'s "best-effort IO that never
// throws" discipline: a denied or corrupt slot is skipped, not fatal, and a
// denied write is a silent no-op — same reason `stash()`'s own catch exists
// ("diagnostics never break a teardown").

const SLOT_KEYS = [
  "ergomatic:session-log-h1",
  "ergomatic:session-log-h2",
  "ergomatic:session-log-h3",
] as const;

interface StoredSlot {
  savedAt: string;
  exported: string;
}

export interface SessionLogHistoryEntry {
  /** 1 = newest. */
  slot: 1 | 2 | 3;
  /** ISO timestamp written at rotation — the display "when". */
  savedAt: string;
  /** The ring's exported JSON, byte-identical to what teardown stashed. */
  exported: string;
}

function isStoredSlot(value: unknown): value is StoredSlot {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).savedAt === "string" &&
    typeof (value as Record<string, unknown>).exported === "string"
  );
}

/** Best-effort read of one raw slot key. `null` for absent, denied, or
 *  malformed — the three cases `listSessionLogs` must treat identically
 *  (skip, never throw). */
function readSlot(key: string): StoredSlot | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredSlot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Best-effort write of one raw slot key. Silent no-op on denial (quota,
 *  privacy mode) — same discipline as `stash()`'s own catch. */
function writeSlot(key: string, value: StoredSlot): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or privacy mode: diagnostics never break a teardown.
  }
}

/** Rotates `exported` into slot 1, shifting 1→2→3, oldest evicted.
 *  Never throws. */
export function pushSessionLog(exported: string, savedAt: Date): void {
  // Read the shift sources BEFORE any write — h3's prior contents are about
  // to be overwritten by h2's, so both reads happen first, then both writes,
  // oldest-shift-first so a mid-sequence denial never duplicates a slot.
  const priorH2 = readSlot(SLOT_KEYS[1]);
  const priorH1 = readSlot(SLOT_KEYS[0]);
  if (priorH2 !== null) writeSlot(SLOT_KEYS[2], priorH2);
  if (priorH1 !== null) writeSlot(SLOT_KEYS[1], priorH1);
  writeSlot(SLOT_KEYS[0], { savedAt: savedAt.toISOString(), exported });
}

/** Newest-first list of whatever slots exist. Never throws; a corrupt or
 *  denied slot is skipped, not fatal. */
export function listSessionLogs(): SessionLogHistoryEntry[] {
  const entries: SessionLogHistoryEntry[] = [];
  SLOT_KEYS.forEach((key, index) => {
    const stored = readSlot(key);
    if (stored === null) return;
    entries.push({
      slot: (index + 1) as 1 | 2 | 3,
      savedAt: stored.savedAt,
      exported: stored.exported,
    });
  });
  return entries;
}
