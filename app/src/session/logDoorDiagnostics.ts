import type { MonitorLogEntry } from "../monitor/eventLog";

// Task 1 (lost-monitor design spec): mirrors `recordPostSacrifice`'s own
// append idiom (`LogSession.tsx`, module scope), recording WHICH gate a
// `from=monitor` arrival missed on. Best-effort and silent on any failure (missing or
// malformed stash, localStorage disabled) — diagnostics never block this
// screen's render.
//
// **ITS OWN KEY, AND THE PREMISE THAT SENT IT SOMEWHERE ELSE WAS FALSE**
// (fix round, whole-branch review MEDIUM). Task 1 appended these entries
// straight onto `ergomatic:last-session-log`, on the stated premise that a
// `from=monitor` arrival "just finished tearing down the connected session
// that sent it here, so this key is very likely to already hold that
// session's own exported ring". It does not — it holds the PREVIOUS
// session's ring, and it is about to be overwritten:
//
//  - this append runs during `ManualDoorLog`'s RENDER (a lazy `useState`
//    initializer in `LogSession.tsx`), and
//  - `useMonitorSession.ts`'s `teardown` is a PASSIVE effect cleanup
//    (`useEffect(() => teardown, [teardown])`) whose stash does a full
//    `localStorage.setItem` of that same key.
//
// React runs the new route's render before the old subtree's passive
// unmount, so on the flagship `?from=monitor` arrival the entry was written
// and clobbered milliseconds later — destroyed on the one path it was built
// for, with every unit test green because they called `monitorModeRun`
// directly and never navigated.
//
// A separate key, rather than teaching `teardown` to merge: the two writers
// are on opposite sides of a navigation, neither can see the other's
// timing, and a merge would have to distinguish "entries from the session
// I am closing" from "entries from the session before it" using data
// neither side carries. The single-artifact intent survives in the READ:
// `LogSession.tsx`'s `readMonitorLogStash` merges the misses onto the ring, so `MONITOR LOG ·
// COPY` still yields one story in one paste.
export const LOG_DOOR_MISS_KEY = "ergomatic:log-door-misses";
const LOG_DOOR_MISS_CAPACITY = 500;

export function recordLogDoorMiss(condition: string): void {
  recordLogDoorEntry("log-door-miss", condition);
}

/** The log doors' own diagnostics side-channel, with the `kind` open:
 *  `recordLogDoorMiss` above is one kind; the Just Row door's
 *  both-records conflict (`justrow/JustRowLog.tsx`, spec 2026-09-02 exit
 *  criterion 7c) is another — a violated invariant it must file rather
 *  than pick past silently, and this key is the one ring a log door can
 *  write from its own render (see the comment above on why it is not
 *  the session stash). Merged into the MONITOR LOG paste by
 *  `LogSession.tsx`'s `withDoorMisses` like every other entry here.
 *
 *  Its own module (not `LogSession.tsx`, where it lived) because a
 *  screen file exporting a plain function trips
 *  `react-refresh/only-export-components`; the key and both writers moved
 *  together so the reader and the writers still name one constant. */
export function recordLogDoorEntry(kind: string, detail: string): void {
  try {
    const raw = localStorage.getItem(LOG_DOOR_MISS_KEY);
    let entries = raw !== null ? (JSON.parse(raw) as MonitorLogEntry[]) : [];
    const nextSeq =
      entries.length > 0 ? entries[entries.length - 1]!.seq + 1 : 0;
    entries.push({
      seq: nextSeq,
      atMs: Date.now(),
      kind,
      detail,
    });
    if (entries.length > LOG_DOOR_MISS_CAPACITY) {
      entries = entries.slice(entries.length - LOG_DOOR_MISS_CAPACITY);
    }
    localStorage.setItem(LOG_DOOR_MISS_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort diagnostics; never block or complicate this screen's render.
  }
}
