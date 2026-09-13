import type { StatsSummary } from "../../../domain/stats/aggregate.js";
import { fmtMeters, fmtSeconds } from "./format";

export const NO_MONITOR_ROWS = "NO MONITOR ROWS YET";

/** TOTALS (spec §5 item 2, §14 rulings 5/6/16/19): METRES / TIME /
 *  SESSIONS in both columns, then REST METRES / CALORIES / AVG WATTS under
 *  MACHINE only — HIDDEN when no `pm5` row is in range; the MACHINE column
 *  itself never collapses. NO prose: rulings 18 and 19 struck every
 *  caption, the seam line and the n OF m footnote included. The aggregate
 *  still computes `storedTierRows`, `ownTotals` and `caloriesRows` (they
 *  govern the watts exclusion); nothing here renders them. */
export default function TotalsGroup({ summary }: { summary: StatsSummary }) {
  const { all, machine } = summary;
  const hasMachine = machine.sessions > 0;
  const cell = (v: string) => (hasMachine ? v : "");
  return (
    <section className="stats-group" aria-labelledby="stats-totals-h">
      <h2 id="stats-totals-h" className="stats-group-title">
        TOTALS
      </h2>
      {/* A3's TOTALS card: a `--surface` panel on the page, `112px 1fr 1fr`
          columns (fixed layout, so the ALL ROWS header never wraps and the
          TIME cells never touch). */}
      <div className="stats-card">
        <table className="stats-table">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">ALL ROWS</th>
              <th scope="col">MACHINE</th>
            </tr>
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
                  <th scope="row">CALORIES</th>
                  <td />
                  <td>{fmtMeters(machine.calories)}</td>
                </tr>
                <tr>
                  <th scope="row">AVG WATTS</th>
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
      </div>
    </section>
  );
}
