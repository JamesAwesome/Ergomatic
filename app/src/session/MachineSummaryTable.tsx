import { DASH } from "../workout/connected/surfaceModel";
import type { MachineSplitRow } from "./summaryModel";

/** Gate 0B round 2, approved 2026-09-15 (ruling 2 option B). Grouped so each heading is
 *  true of what sits under it. MEASURED = the monitor's own figures; DERIVED
 *  = we reproduced Concept2's own logbook figures from them
 *  (`domain/logbook.ts`, re-exported through `session/logbookDerived.ts`).
 *  Deliberately NOT "ours" — the formula is
 *  theirs and only the running of it is ours.
 *
 *  WORDS CHOSEN BY JAMES, 2026-09-15, over a stated objection, and the
 *  objection is recorded here rather than dropped: "MEASURED" is loose over
 *  CAL and DRAG, which the monitor almost certainly computes from flywheel
 *  data rather than measures. **That is NOT sourced from this repo** —
 *  `pm5-interface-notes.md` documents both as wire fields (0x0039[6-7],
 *  0x0038[16]) and says nothing about how the monitor arrives at them, so
 *  the objection rests on outside knowledge and is weaker than it first
 *  sounded. If a future capture or a Concept2 sentence settles it, this is
 *  the comment to come back to. */
const MEASURED = ["HR", "CAL", "DRAG", "REST m"] as const;
const DERIVED = ["WATTS", "CAL/HOUR"] as const;

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
 * surface. WATTS and CAL/HOUR are the logbook's arithmetic (§3.1).
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
        <span className="machine-summary-eyebrow">PER INTERVAL</span>
      </div>
      {/* A scroll container with no focusable content must itself be
          keyboard-reachable (WCAG 2.1.1; axe `scrollable-region-focusable`,
          which reports only past a 13 px overflow buffer — the strip
          overflows a 390 px screen by a few px today and by more with a
          two-digit `#`, whole-branch review H1). `tabIndex={0}` +
          `role="region"` name it for the keyboard and the reader. */}
      <div
        className="machine-summary-scroller"
        role="region"
        aria-label="Machine summary, scrolls sideways"
        tabIndex={0}
      >
        <table
          className="machine-summary"
          aria-label="Machine summary per interval"
        >
          <thead>
            <tr className="machine-summary-groups">
              <th className="machine-summary-pin" aria-hidden="true" />
              <th scope="colgroup" colSpan={DERIVED.length}>
                DERIVED
              </th>
              <th scope="colgroup" colSpan={MEASURED.length}>
                MEASURED
              </th>
            </tr>
            <tr>
              <th scope="col" className="machine-summary-pin">
                #
              </th>
              {[...DERIVED, ...MEASURED].map((c) => (
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
                <td>{cell(r.watts)}</td>
                <td>{cell(r.calPerHour)}</td>
                <td>{cell(r.hr)}</td>
                <td>{cell(r.calories)}</td>
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
