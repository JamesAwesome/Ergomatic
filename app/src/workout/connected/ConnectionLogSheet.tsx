// The diagnostics sheet (handoff §5). Triple-tap any pager target and this
// is what opens: `Connection log`, the driver's own event ring buffer as a
// mono 11px list, then `COPY LOG` (level 3, solid ink — it acts inside the
// sheet) and `Close` (level 2). "Unpolished on purpose."
//
// A WINDOW, NOT A SOURCE. The log has no subscription and design spec §5
// says it never gets one, so this reads `MonitorSession.exportLog()` ONCE,
// on open, and draws that snapshot until the sheet is re-opened. The read
// happens in a `useState` initialiser rather than an effect so the first
// paint already has the entries — an effect would flash an empty panel and,
// worse, would re-read on every dependency change and quietly turn the
// snapshot into a subscription.
//
// COPY LOG COPIES THE STRING THIS SHEET WAS BUILT FROM, byte for byte. That
// is why `exportLog()` returns the JSON rather than the entry array: there
// is exactly one serialization, the one on screen and the one on the
// clipboard are the same bytes, and a bug report cannot arrive holding a
// prettier re-encoding of a log we never had. Nothing here re-stringifies
// anything.

import { useState, type RefObject } from "react";
import { SheetShell } from "../../components/SheetShell";
import type { MonitorLogEntry } from "../../monitor/eventLog";

const TITLE_ID = "connection-log-sheet-title";

/** `COPY LOG`'s three states. No timer resets them — the sheet is
 *  transient, and a 2 s label flip is one more thing moving on a screen a
 *  rower opened because something had already gone wrong. */
type CopyState = "idle" | "copied" | "failed";

const COPY_LABEL: Record<CopyState, string> = {
  idle: "COPY LOG",
  copied: "COPIED",
  failed: "COPY FAILED",
};

/** `exportLog()`'s JSON back into entries, defensively. The string comes
 *  from `eventLog.ts`'s own `JSON.stringify(entries)` and is always an
 *  array of `{seq, kind, detail}` — but this sheet exists for the sessions
 *  where something has already gone wrong, and it must not be the thing
 *  that throws. Anything unparseable reads as "no events", which is what
 *  the empty-log case renders anyway. */
// eslint-disable-next-line react-refresh/only-export-components
export function parseLogEntries(raw: string): MonitorLogEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (e): e is MonitorLogEntry =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as MonitorLogEntry).seq === "number" &&
      typeof (e as MonitorLogEntry).kind === "string" &&
      typeof (e as MonitorLogEntry).detail === "string",
  );
}

/** One line of the list. The mockup's leading column is a session-relative
 *  TIMESTAMP; the log does not have one and deliberately never will —
 *  `eventLog.ts` orders by a monotonic `seq` precisely because two entries
 *  recorded in the same microtask would carry an identical `Date.now()` and
 *  lose their order. So the sequence number is what leads, zero-padded so
 *  the kinds stay in a column. Recorded in DEVIATIONS. */
// eslint-disable-next-line react-refresh/only-export-components
export function logLine(entry: MonitorLogEntry): string {
  const seq = String(entry.seq).padStart(4, "0");
  return `${seq} ${entry.kind.toUpperCase()} ${entry.detail}`;
}

export default function ConnectionLogSheet({
  deviceCaption,
  elapsedDisplay,
  readLog,
  opener,
  onClose,
}: {
  /** `PM5 430123456`, the same caption the panes' connection line shows. */
  deviceCaption: string;
  /** The session clock, for the caption's `SESSION h:mm:ss`. */
  elapsedDisplay: string;
  /** `MonitorSession.exportLog` — called exactly once, on open. */
  readLog: () => string;
  opener: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  // The one read. `useState`'s initialiser runs on the first render only,
  // which is what makes "on open" literal: this component is mounted by the
  // triple-tap and unmounted by Close.
  const [raw] = useState(readLog);
  const [entries] = useState(() => parseLogEntries(raw));
  const [copy, setCopy] = useState<CopyState>("idle");

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(raw);
      setCopy("copied");
    } catch {
      // A browser with no clipboard permission (or no clipboard API at
      // all) says so on the button rather than silently doing nothing —
      // the rower is copying this to send it to someone.
      setCopy("failed");
    }
  }

  return (
    <SheetShell open titleId={TITLE_ID} onDismiss={onClose} opener={opener}>
      <div className="filter-sheet-header">
        <h2 id={TITLE_ID} className="filter-sheet-title">
          Connection log
        </h2>
      </div>
      <p className="connected-log-caption">
        {deviceCaption} · {entries.length} EVENT
        {entries.length === 1 ? "" : "S"} · SESSION {elapsedDisplay}
      </p>
      {/* Focusable and named on purpose, exactly as `PaneGrid.tsx`'s own
          TAB ORDER note argues for `.connected-grid-rows`: this is an
          `overflow-y: auto` container, so Chromium already makes it a tab
          stop implicitly while iOS Safari — the real target — does not.
          Declaring it is the only way the two engines agree, and keyboard
          operability of a scrollable region is WCAG 2.1.1's requirement,
          not an accident to suppress. `role="group"` rather than `region`:
          a list inside a sheet, not a landmark. Found by the fix wave's H2
          sweep (axe `scrollable-region-focusable`, serious) — the first
          real violation the connected screens' browser gate caught, which
          is the argument for having one. */}
      <div
        className="connected-log-list"
        tabIndex={0}
        role="group"
        aria-label="Connection log entries"
      >
        {entries.length === 0 ? (
          <span className="connected-log-line connected-log-empty">
            NOTHING RECORDED YET
          </span>
        ) : (
          entries.map((entry) => (
            <span key={entry.seq} className="connected-log-line">
              {logLine(entry)}
            </span>
          ))
        )}
      </div>
      {/* L3, solid ink: it acts INSIDE the sheet (handoff §5). Never L1 —
          this sheet has none, which is why `SheetShell.primary` is
          optional. `.button-l3` already carries the handoff's 48px; the
          `.connected-log-copy` hook that restated it is gone (task-7 review,
          L3 — a duplicate identical declaration is two places to change one
          number, not a safeguard). */}
      <button
        type="button"
        className="button-l3"
        onClick={() => void handleCopy()}
      >
        {COPY_LABEL[copy]}
      </button>
      <button type="button" className="button-l2" onClick={onClose}>
        Close
      </button>
    </SheetShell>
  );
}
