import { DASH } from "../workout/connected/surfaceModel";
import type { MachineSplitRow } from "./summaryModel";

const COLUMNS = ["HR", "WATTS", "CAL", "CAL/HR", "DRAG", "REST m"] as const;

/** `undefined` (no frame) and `null` (a belt that said nothing) both read
 *  as the house dash; `0` reads as 0 — "the machine did not say" and "the
 *  machine said zero" are different facts (spec §2). */
function cell(v: number | null | undefined): string {
  return v === undefined || v === null ? DASH : String(v);
}

/**
 * Phase LP §3 (Gate 0 approved 2026-09-07 on
 * `docs/design/logbook-parity/03-chosen-composed.html`): the PM5's own
 * per-interval figures, under today's INTERVALS table. Scrolls SIDEWAYS
 * inside its own container with the `#` column pinned, never wraps, and the
 * page itself never scrolls sideways (`.machine-summary-scroller` owns the
 * overflow). No ALL row — the hero tiles are the session — and no SPM,
 * which the INTERVALS table already shows beside its target. Renders
 * nothing without rows, so a manual row or a Just Row (`steps: []`) adds no
 * surface. WATTS and CAL/HR are the logbook's arithmetic (§3.1).
 */
export default function MachineSummaryTable({
  rows,
}: {
  rows: readonly MachineSplitRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="machine-summary-block">
      <div className="machine-summary-head">
        <h3 className="machine-summary-title">MACHINE SUMMARY</h3>
        <span className="machine-summary-eyebrow">PM5 · PER INTERVAL</span>
      </div>
      <div className="machine-summary-scroller">
        <table
          className="machine-summary"
          aria-label="Machine summary per interval"
        >
          <thead>
            <tr>
              <th scope="col" className="machine-summary-pin">
                #
              </th>
              {COLUMNS.map((c) => (
                <th scope="col" key={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.index}>
                <td className="machine-summary-pin">{r.index}</td>
                <td>{cell(r.hr)}</td>
                <td>{cell(r.watts)}</td>
                <td>{cell(r.calories)}</td>
                <td>{cell(r.calPerHour)}</td>
                <td>{cell(r.drag)}</td>
                <td>{cell(r.restMeters)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
