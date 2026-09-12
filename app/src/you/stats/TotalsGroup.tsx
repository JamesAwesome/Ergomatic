import type { StatsSummary } from "../../../domain/stats/aggregate.js";
import { fmtMeters, fmtSeconds, seamLine } from "./format";

export const TOTALS_CAPTION =
  "ERGOMATIC ROWS ONLY · WORK METRES · REST SHOWN SEPARATELY";
export const NO_MONITOR_ROWS = "NO MONITOR ROWS YET";

/** TOTALS (spec §5 item 2, §14 rulings 5/6/15/16): METRES / TIME /
 *  SESSIONS in both columns, then REST METRES / CALORIES / AVG WATTS under
 *  MACHINE only — HIDDEN, with both `n OF m` lines, when no `pm5` row is in
 *  range; the MACHINE column itself never collapses. */
export default function TotalsGroup({ summary }: { summary: StatsSummary }) {
  const { all, machine } = summary;
  const hasMachine = machine.sessions > 0;
  const cell = (v: string) => (hasMachine ? v : "");
  return (
    <section className="stats-group" aria-labelledby="stats-totals-h">
      <h2 id="stats-totals-h" className="stats-group-title">
        TOTALS
      </h2>
      <p className="stats-caption">{TOTALS_CAPTION}</p>
      {summary.storedTierRows > 0 && (
        <p className="stats-caption">{seamLine(summary.storedTierRows)}</p>
      )}
      <table className="stats-table">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">ALL ROWS</th>
            <th scope="col">MACHINE</th>
          </tr>
          {hasMachine && (
            <tr>
              <td colSpan={3} className="stats-note">
                {machine.ownTotals} OF {machine.sessions} CARRY THE MONITOR'S
                OWN TOTALS
              </td>
            </tr>
          )}
        </thead>
        <tbody>
          <tr>
            <th scope="row">METRES</th>
            <td>{fmtMeters(all.meters)}</td>
            <td>{cell(fmtMeters(machine.meters))}</td>
          </tr>
          <tr>
            <th scope="row">TIME</th>
            <td>{fmtSeconds(all.seconds)}</td>
            <td>{cell(fmtSeconds(machine.seconds))}</td>
          </tr>
          <tr>
            <th scope="row">SESSIONS</th>
            <td>{all.sessions}</td>
            <td>{cell(String(machine.sessions))}</td>
          </tr>
          {!hasMachine && (
            <tr>
              <td />
              <td />
              <td className="stats-note">{NO_MONITOR_ROWS}</td>
            </tr>
          )}
          {hasMachine && (
            <>
              <tr>
                <th scope="row">REST METRES</th>
                <td />
                <td>{fmtMeters(machine.restMeters)}</td>
              </tr>
              <tr>
                <th scope="row">
                  CALORIES
                  <span className="stats-row-caption">
                    {machine.caloriesRows} OF {machine.sessions} ROWS CARRY IT ·
                    MONITOR'S OWN COUNT
                  </span>
                </th>
                <td />
                <td>{fmtMeters(machine.calories)}</td>
              </tr>
              <tr>
                <th scope="row">
                  AVG WATTS
                  <span className="stats-row-caption">
                    AT THE RANGE'S AVERAGE PACE · WORK-ONLY ROWS
                  </span>
                </th>
                <td />
                <td>
                  {machine.avgWatts === undefined
                    ? "—"
                    : String(machine.avgWatts)}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </section>
  );
}
