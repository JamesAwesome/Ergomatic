// Task 3, Gate 0 rev 2/3 (James, 2026-09-01, ring-door-gate.html): "a menu,
// not a direct row." You's own DIAGNOSTICS row lands HERE first, not on
// Monitor logs directly — this screen is the extensible home for every
// diagnostic tool that follows; today it holds exactly one entry. Named
// DIAGNOSTICS (not "advanced"/"debug") because that is the word the app
// already uses for this class of thing — the diagnostics sheet
// (`ConnectionLogSheet.tsx`), "diagnostic logs" (this door's own caption).
//
// No data of its own: a static menu, so there is nothing here to read on
// mount and nothing to keep in sync.

import { Link } from "react-router-dom";
import BackLink from "../shell/BackLink";

export default function Diagnostics() {
  return (
    <main className="screen overlay-screen" tabIndex={0}>
      <BackLink fallback="/you" />
      <h1 className="screen-title">Diagnostics</h1>
      <p className="diag-caption">Tools for looking under the hood.</p>
      <Link
        to="/you/diagnostics/monitor-logs"
        state={{ from: "/you/diagnostics" }}
        className="diag-card"
      >
        {/* M-5 (final whole-branch review): `<div>`, not `<span>` — a
            `<span>` is inline and cannot legally contain the block-level
            `<p>`s below it. MonitorLogs.tsx's own `LogEntryCard` uses the
            identical wrapping `<div>` around its two `<p>`s. */}
        <div>
          <p className="diag-card-title">Monitor logs</p>
          <p className="diag-card-sub">THE LAST 3 CONNECTED SESSIONS</p>
        </div>
        <span aria-hidden="true" className="diag-chevron">
          &rsaquo;
        </span>
      </Link>
    </main>
  );
}
