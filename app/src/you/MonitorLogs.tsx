// Task 3 (Gate 0 rev 3, approved 2026-09-01,
// docs/superpowers/specs/2026-08-31-ring-door-gate.html): the diagnostics
// ring's own door. Task 1's `listSessionLogs()` keeps the last three
// connected sessions' exported logs — `sessionLogHistory.ts`'s own header
// covers the storage shape and the "why history exists" story (the
// pocketed-phone evidence a single perishable slot destroyed). This screen
// is read-and-copy only: no viewer, no delete, no share sheet (Gate 0 §3)
// — the clipboard is the whole job, same as `ConnectionLogSheet`'s COPY
// LOG.
//
// ONE READ, ON MOUNT. Same `useState` initialiser idiom as
// `ConnectionLogSheet` (its own header explains why an effect would be
// wrong here too): the ring has no subscription, so this is a snapshot of
// whatever `listSessionLogs()` returned when the screen opened, not a live
// view. Re-visiting the screen re-reads.
//
// COPY IS BYTE-IDENTICAL, PER ENTRY. `entry.exported` is copied verbatim —
// never re-`JSON.stringify`d — for the same reason `ConnectionLogSheet`'s
// own header gives: a bug report must never arrive holding a re-encoding
// of a log the app never actually had.
//
// A CORRUPT EXPORT RENDERS NO ROW. `entry.exported` is opaque JSON read
// from a possibly-tampered or truncated localStorage value —
// `sessionLogHistory.ts` already treats a malformed SLOT as absent; this
// treats a malformed EXPORT the same way at the one point that looks
// inside it (the "N EVENTS" count). Never a fatal render, per this ring's
// whole "diagnostics never break anything" discipline.

import { useState } from "react";
import BackLink from "../shell/BackLink";
import { formatTimeOfDay } from "../session/summaryModel";
import {
  listSessionLogs,
  type SessionLogHistoryEntry,
} from "../monitor/sessionLogHistory";

/** `COPY`'s three states — `ConnectionLogSheet`'s own `CopyState` contract,
 *  repeated per entry here rather than shared: each card owns its own
 *  clipboard result independently, so copying entry 2 must never flip
 *  entry 1's label. */
type CopyState = "idle" | "copied" | "failed";

const COPY_LABEL: Record<CopyState, string> = {
  idle: "COPY",
  copied: "COPIED",
  failed: "COPY FAILED",
};

/** "Today"/"Yesterday" against LOCAL calendar days; anything older falls
 *  back to a short absolute date. `now` is a parameter (not `new Date()`
 *  read inline) so both this function and its caller stay testable without
 *  faking the system clock — and so a screen that stays mounted overnight
 *  never silently relabels "Today" to "Yesterday" mid-read (the read
 *  already happened once, on mount). */
function dayLabel(savedAt: Date, now: Date): string {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(savedAt)) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return savedAt.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Gate 0's own example: `Today, 18:42`. Reuses `summaryModel.ts`'s
 *  `formatTimeOfDay` (h23-pinned, device-locale minutes precision,
 *  `storedSummary.ts`'s own reuse of it too) rather than a second time
 *  formatter — no existing day-relative label exists anywhere in the app
 *  yet (`news/newsDates.ts`, `log/LogRow.tsx`'s own `formatLogDate`,
 *  `today/todayPick.ts` all checked: none do "Today"/"Yesterday"), so
 *  `dayLabel` above is new. */
// eslint-disable-next-line react-refresh/only-export-components
export function sessionWhenLabel(savedAt: string, now: Date): string {
  return `${dayLabel(new Date(savedAt), now)}, ${formatTimeOfDay(savedAt)}`;
}

/** `exported`'s ring JSON is always an array (`eventLog.ts`'s own
 *  `exportLog()`); `null` for anything else, so the caller can drop the
 *  whole row rather than print a fabricated count. Deliberately shallower
 *  than `ConnectionLogSheet`'s own `parseLogEntries`: that sheet renders
 *  every entry and so must validate each one; this screen only ever prints
 *  a length, so the array check alone is the whole job. */
function eventCount(exported: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(exported);
  } catch {
    return null;
  }
  return Array.isArray(parsed) ? parsed.length : null;
}

function LogEntryCard({
  entry,
  count,
  now,
}: {
  entry: SessionLogHistoryEntry;
  count: number;
  now: Date;
}) {
  const [copy, setCopy] = useState<CopyState>("idle");

  async function handleCopy(): Promise<void> {
    try {
      // The bytes `sessionLogHistory.ts` stashed, verbatim — never
      // re-stringified (see the module header above).
      await navigator.clipboard.writeText(entry.exported);
      setCopy("copied");
    } catch {
      // No clipboard permission, or no clipboard API at all — say so on
      // the button rather than silently doing nothing.
      setCopy("failed");
    }
  }

  return (
    <div className="diag-log-card">
      <div>
        <p className="diag-log-when">{sessionWhenLabel(entry.savedAt, now)}</p>
        <p className="diag-log-count">
          {count} EVENT{count === 1 ? "" : "S"}
        </p>
      </div>
      <button
        type="button"
        className="diag-copy"
        onClick={() => void handleCopy()}
      >
        {COPY_LABEL[copy]}
      </button>
    </div>
  );
}

/** One row per entry whose export actually parsed — computed ONCE, off the
 *  same mount-time snapshot, so a corrupt slot is decided before either
 *  branch below renders: an entry with no valid count is never counted
 *  toward "there are logs" (a screen showing neither a card nor the empty
 *  state would be a third, undocumented state). */
function renderableRows(
  entries: SessionLogHistoryEntry[],
): { entry: SessionLogHistoryEntry; count: number }[] {
  return entries.flatMap((entry) => {
    const count = eventCount(entry.exported);
    return count === null ? [] : [{ entry, count }];
  });
}

export default function MonitorLogs() {
  // The one read (see module header). Entries arrive newest-first straight
  // from `listSessionLogs()` — never re-sorted here.
  const [entries] = useState(listSessionLogs);
  // Read once alongside the entries, not per render: `dayLabel` compares
  // each `savedAt` against the SAME "now" the screen opened with, so a
  // session started just before midnight and read just after doesn't
  // silently jump from "Today" to "Yesterday" mid-scroll.
  const [now] = useState(() => new Date());
  const rows = renderableRows(entries);

  return (
    <main className="screen overlay-screen" tabIndex={0}>
      <BackLink fallback="/you/diagnostics" />
      <h1 className="screen-title">Monitor logs</h1>
      <p className="diag-caption">
        The app keeps the last three connected sessions&apos; diagnostic logs.
        Copy one to send it with a bug report.
      </p>
      {rows.length === 0 ? (
        <p className="diag-empty">
          No logs yet. They appear here after a connected session.
        </p>
      ) : (
        rows.map(({ entry, count }) => (
          <LogEntryCard
            key={entry.slot}
            entry={entry}
            count={count}
            now={now}
          />
        ))
      )}
    </main>
  );
}
