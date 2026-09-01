// Lifecycle design spec §2 ("The ring becomes readable and durable"): the
// single `ergomatic:last-session-log` slot (`useMonitorSession.ts`'s
// `stash()`, `LogSession.tsx`'s `readMonitorLogStash`) is perishable — one
// key, one slot — and it is exactly this perishability that destroyed the
// pocketed-phone ring: the log that would have proven or refuted §0.1's
// hypothesis was overwritten by the very next teardown, before anyone got a
// chance to read it. This module does not touch that key or its reader; it
// adds a THREE-ENTRY HISTORY beside it, additive, so the last three LOGICAL
// connected sessions' exports all survive at once (one entry per `connect()`,
// however many teardown passes it takes to close it out — review round 2's
// own identity-bound upsert, below, is what makes "session" rather than
// "teardown call" the true unit). Task 3 builds the ungated door that lists
// them; this module is read-and-write plumbing only.
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
// `JSON.stringify({sessionId, savedAt, exported}[])` — newest first, capped
// at `MAX_ENTRIES`. This REPLACES the original three-key `h1`/`h2`/`h3`
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
// IDENTITY-BOUND UPSERT — review round 2, items 1+2 (P1+P2, PR #258): the
// original API was a PAIR, `pushSessionLog` (rotate a new entry to the
// front) and `updateNewestSessionLog` (overwrite the front entry in place),
// with the CALLER (`useMonitorSession.ts`'s `stash()`) deciding which one to
// call via a per-teardown-invocation ref — "has THIS teardown call already
// pushed?". That guard was the bug, in two shapes: (A) a Cancel whose own
// `teardown()` call runs AFTER an interleaved unmount's `teardown()` call
// (the PM5's terminate ack arrives after the component is already gone) is
// TWO SEPARATE invocations of the SAME function, each resetting its own
// "already pushed" ref at its own top — so one connected session called
// `pushSessionLog` twice and burned two ring slots on itself. (B) a DENIED
// first write still flipped the guard (the write attempt happened; whether
// it landed was never checked), so the caller's SECOND write called
// `updateNewestSessionLog`, overwriting whatever the ring's current head
// slot actually held — a DIFFERENT session's entry, not the one that just
// failed to land.
//
// The fix removes the guard's job entirely by giving the history an
// IDENTITY to key on instead of a call-count to track: every stored entry
// carries the `sessionId` the caller minted once per `connect()` (a value
// this module treats as opaque — it enforces no format, no uniqueness, no
// lifetime; that is `useMonitorSession.ts`'s to own) and there is ONE public
// write function, `upsertSessionLog`, which searches the ring for an entry
// already carrying that id and REPLACES it in place if found, or INSERTS a
// fresh entry at the head (evicting past `MAX_ENTRIES`) if not. However many
// times a caller invokes it for the SAME session id — one stash, two, three,
// across however many separate `teardown()` calls — the result converges on
// exactly one entry, by construction: there is no per-call state to get out
// of sync, because the only state that matters (does an entry with this id
// exist right now) is read fresh from storage on every call. And a DENIED
// write never gets a chance to mislead the next call: nothing landed, so
// nothing matches, so the retry is an honest insert — never a replace of
// whichever unrelated entry happened to sit at the head.
//
// Every export below follows `monitorRun.ts`'s "best-effort IO that never
// throws" discipline: a corrupt or unreadable stored value is treated as
// absent, not fatal, and a denied write is a silent no-op — same reason
// `stash()`'s own catch exists ("diagnostics never break a teardown").

const HISTORY_KEY = "ergomatic:session-log-history";
const MAX_ENTRIES = 3;

interface StoredEntry {
  sessionId: string;
  savedAt: string;
  exported: string;
}

export interface SessionLogHistoryEntry {
  /** 1 = newest, derived from the entry's position in the stored array —
   *  no longer a literal key suffix now that the array shape holds one
   *  ordered list rather than three independently-addressed slots. */
  slot: 1 | 2 | 3;
  /** The logical connected session this entry belongs to — opaque to this
   *  module, minted once per `connect()` by `useMonitorSession.ts`. The
   *  identity `upsertSessionLog` matches on (see the module header's
   *  "IDENTITY-BOUND UPSERT" paragraph). */
  sessionId: string;
  /** ISO timestamp written at rotation — the display "when". */
  savedAt: string;
  /** The ring's exported JSON, byte-identical to what teardown stashed. */
  exported: string;
}

/** M-7 (final whole-branch review), TIGHTENED at review round 2, item 3:
 *  the original check, `!Number.isNaN(Date.parse(value))`, rejects only a
 *  value `Date` cannot parse at all — it does NOT reject a value `Date`
 *  parses by NORMALIZING it to something else, e.g. `Date.parse` silently
 *  rolls `"2026-02-30T00:00:00.000Z"` forward to March 2nd rather than
 *  refusing it, and accepts a bare `"2026"` as midnight UTC on January 1st.
 *  Neither shape is one `upsertSessionLog` — the only writer — ever
 *  produces (it always stores `savedAt.toISOString()`), so REQUIRING the
 *  exact round-trip (`new Date(value).toISOString() === value`) rejects
 *  every value that parses to something OTHER than what it says, while
 *  still accepting every value the writer actually stores — a strictly
 *  narrower, still-correct filter for exactly the same reason the original
 *  comment gives: reaching `MonitorLogs.tsx`'s `new Date(entry.savedAt)`
 *  with a string that silently means a DIFFERENT instant than it displays
 *  is its own kind of wrong, not just an outright parse failure. */
function isValidSavedAt(value: string): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString() === value;
}

function isStoredEntry(value: unknown): value is StoredEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).sessionId === "string" &&
    typeof (value as Record<string, unknown>).savedAt === "string" &&
    isValidSavedAt((value as Record<string, unknown>).savedAt as string) &&
    typeof (value as Record<string, unknown>).exported === "string"
  );
}

/** Best-effort read of the whole history array. `[]` for absent, denied, or
 *  malformed storage, or a JSON value that parses but isn't an array —
 *  every one of those degrades to "no history", never a throw. Each
 *  ARRAY ELEMENT is independently validated: one corrupt entry (or one
 *  whose `savedAt` doesn't parse, or one missing `sessionId` entirely — the
 *  shape a pre-review-round-2 stored value has, since there is no
 *  migration, per the module header) is dropped, not fatal to its siblings.
 *  Over-length arrays (should not occur — every writer below caps at
 *  `MAX_ENTRIES` — but a hand-edited or future-version value is not this
 *  module's to trust) are trimmed to `MAX_ENTRIES` too. */
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

/** THE ONLY PUBLIC WRITE FUNCTION (review round 2, items 1+2 — see the
 *  module header's "IDENTITY-BOUND UPSERT" paragraph for the full account
 *  of the two defects this replaces `pushSessionLog`/
 *  `updateNewestSessionLog` to fix). Searches the current history for an
 *  entry already carrying `sessionId`:
 *  - FOUND: replaces that entry in place with fresher bytes — no rotation,
 *    the list's length and the other entries' order are unchanged.
 *  - NOT FOUND: inserts a fresh entry at the head, evicting past
 *    `MAX_ENTRIES` — the ordinary "a new session's first stash" case.
 *  Either branch ends in exactly one `writeHistory` call, so this is still
 *  the atomic single-`setItem` write M-6 established. Never throws — the
 *  read and the write below both already degrade to "no-op"/"empty" on
 *  denial or corruption. */
export function upsertSessionLog(
  sessionId: string,
  exported: string,
  savedAt: Date,
): void {
  const entry: StoredEntry = {
    sessionId,
    savedAt: savedAt.toISOString(),
    exported,
  };
  const existing = readHistory();
  const index = existing.findIndex((e) => e.sessionId === sessionId);
  const next =
    index === -1
      ? [entry, ...existing].slice(0, MAX_ENTRIES)
      : existing.map((e, i) => (i === index ? entry : e));
  writeHistory(next);
}

/** Newest-first list of whatever entries exist. Never throws; a corrupt or
 *  denied entry is skipped, not fatal (see `readHistory`). `slot` is
 *  derived from array position, 1-indexed. */
export function listSessionLogs(): SessionLogHistoryEntry[] {
  return readHistory().map((entry, index) => ({
    slot: (index + 1) as 1 | 2 | 3,
    sessionId: entry.sessionId,
    savedAt: entry.savedAt,
    exported: entry.exported,
  }));
}
