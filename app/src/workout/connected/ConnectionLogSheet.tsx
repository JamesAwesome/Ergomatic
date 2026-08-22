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
//
// THE MIRROR (`surfaceModel.ts`'s Item 3, connected-axes design spec §2)
// DOES NOT REACH HERE, ON PURPOSE. This sheet's entries are the driver's
// own raw event ring — never routed through `buildSurfaceModel` — so a
// carried-over spm/split ghost the heroes now mirror to 0 still shows up
// here at its real wire value. That is correct, not a gap: the sheet's job
// is showing what the machine actually said, and stating it here means
// nobody re-discovers it as a bug and "fixes" the one place a rower
// reporting a defect can see the truth.

import { useState, type RefObject } from "react";
import { SheetShell } from "../../components/SheetShell";
import type { WorkoutProgram } from "../../../domain/monitor/program.js";
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
 *  TIMESTAMP; this deliberately still leads with SEQUENCE instead
 *  (`entry.seq`, zero-padded so the kinds stay in a column) — NOT because
 *  the log has no clock any more (Phase LL Task 1 gave every entry an
 *  `atMs`, `eventLog.ts`'s own header has the full reasoning), but because
 *  `seq` stays the ORDERING authority: two entries recorded in the same
 *  microtask can carry an identical `atMs` and lose their relative order,
 *  which `seq` never does. `atMs` still rides along in the exported JSON
 *  (`COPY LOG` carries it) for whoever needs a wall-clock cross-reference;
 *  this dense mono list just doesn't print it. Recorded in DEVIATIONS. */
// eslint-disable-next-line react-refresh/only-export-components
export function logLine(entry: MonitorLogEntry): string {
  const seq = String(entry.seq).padStart(4, "0");
  return `${seq} ${entry.kind.toUpperCase()} ${entry.detail}`;
}

export default function ConnectionLogSheet({
  deviceCaption,
  elapsedDisplay,
  readLog,
  program,
  opener,
  onClose,
}: {
  /** `PM5 430123456`, the same caption the panes' connection line shows. */
  deviceCaption: string;
  /** The session clock, for the caption's `SESSION h:mm:ss`. */
  elapsedDisplay: string;
  /** `MonitorSession.exportLog` — called exactly once, on open. */
  readLog: () => string;
  /** What was actually programmed, for `Download recording`'s header
   *  (B4) — the surface's own `program`, threaded straight through. Never
   *  read unless the download fires: this sheet's usual path (the log
   *  list, COPY LOG) has no use for it. */
  program: WorkoutProgram;
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
      {/* DEV-ONLY: gated on presence, not a build flag, so it renders in a
          dev session and in an e2e run that opts into the real-transport
          recording arm — and renders in NEITHER a production build nor the
          e2e fake arm, since only that one gate ever sets the global
          (`transports/index.ts`). This component knows NOTHING about
          `recording.ts` — no import of it anywhere, static or dynamic
          (fix round: a dynamic `import()` gated only on this runtime
          presence check still ships `recording.ts`'s whole module graph,
          `pm5-recording/v1` included, as its own chunk on disk — Rollup can
          only drop an `import()` call site behind a condition it can fold
          at BUILD time, and `window.__pm5Recording__` is a runtime value.
          `download` lives entirely inside `transports/index.ts`'s own
          `fakeMonitorEnabled`-gated dynamic import — the same
          build-time-foldable seam Task 5's dist-grep already proves never
          reaches production — so this handler is just a call through the
          seam). `.button-l3` again: another in-sheet action, same 48px hit
          target. */}
      {window.__pm5Recording__ && (
        <button
          type="button"
          className="button-l3"
          onClick={() => void window.__pm5Recording__?.download(program)}
        >
          Download recording
        </button>
      )}
      <button type="button" className="button-l2" onClick={onClose}>
        Close
      </button>
    </SheetShell>
  );
}
