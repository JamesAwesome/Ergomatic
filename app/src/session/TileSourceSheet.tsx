// Gate 0B round 2, approved 2026-09-15 — ruling 1's drill-down.
//
// Apple Health's pattern, not Strava's: the figure on the tile carries no
// mark, and the answer lives one level down. That is deliberate. Strava's
// rename ("Power" / "Estimated Power") encodes QUALITY, and our axis does
// not — on a terminated piece the 26 we DERIVE is the number the monitor's
// own View Detail screen shows, and the 52 the monitor itself sends is the
// wrong one
// (pm5-interface-notes §27.6), so a mark on the tile face would brand the
// MORE correct number as the less trustworthy one.
//
// Everything here is handed in, already decided. See `tileProvenance.ts`
// for why the sheet performs no lookup of its own.
import { useId, useRef, useState } from "react";
import { SheetShell } from "../components/SheetShell";
import { DASH } from "../workout/connected/surfaceModel";
import type { MachineTileProvenance, TileProvenance } from "./tileProvenance";

/** NO GROUP NOTES, and that is the third time this lesson has been learned in
 *  this one sheet. "Worked out on this device. Each line says from what." was
 *  false of any line reading a dash; "Straight from the monitor, as it sent
 *  them." sat over figures the monitor never sent. A heading cannot be
 *  checked against a value — only a row can — so every claim lives on a row
 *  and the headings say nothing but which group this is. */
function Row({ p, value }: { p: TileProvenance; value: string }) {
  // A row with no number gets NO source sentence. Every `detail` and
  // `because` is an unconditional positive claim — "from the monitor's
  // calorie count", "the average of your splits" — and against a dash each
  // one asserts a quantity that does not exist. That is the same defect as
  // `PM5 · PER INTERVAL`, one level down, and it was in the fix for it.
  const hasNumber = value !== DASH;
  return (
    <div className="tile-source-row">
      <div className="tile-source-line">
        <span className="tile-source-label">{p.label}</span>
        <span className="tile-source-value">{value}</span>
      </div>
      {!hasNumber && (
        <p className="tile-source-because">This piece has no number here.</p>
      )}
      {hasNumber && p.detail !== undefined && (
        <p className="tile-source-because">{p.detail}</p>
      )}
      {hasNumber && p.because !== undefined && (
        <p className="tile-source-because">{p.because}</p>
      )}
    </div>
  );
}

export function TileSourceSheet({
  sources,
  values,
}: {
  sources: MachineTileProvenance;
  values: Record<keyof MachineTileProvenance, string>;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // ORDER IS THE TILE GRID'S ORDER, spelled out rather than taken from
  // `Object.keys`, which returned whatever order the producers' object
  // literals happened to have and did not match the tiles (MEASURED listed
  // CALORIES, DRAG, RATE while the grid reads AVG WATTS, CALORIES,
  // CAL / HOUR, RATE, DRAG, AVG HR). A producer written
  // `{rate, avgHr, ...FIXED_SOURCES}` would have reordered this silently.
  const ORDER = [
    "avgWatts",
    "calories",
    "calPerHour",
    "rate",
    "drag",
    "avgHr",
  ] as const satisfies readonly (keyof MachineTileProvenance)[];
  const keys = ORDER.filter((k) => sources[k] !== undefined);
  const of = (k: (typeof ORDER)[number]) => sources[k]!;
  // Grouped by what each tile's source IS FOR THIS ROW, so the grouping is
  // always true rather than true on average.
  const derived = keys.filter((k) => of(k).source === "derived");
  const measured = keys.filter((k) => of(k).source === "measured");

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="tile-source-opener"
        onClick={() => setOpen(true)}
      >
        Where these numbers come from
      </button>
      <SheetShell
        open={open}
        titleId={titleId}
        onDismiss={() => setOpen(false)}
        opener={opener}
        focusTitleOnOpen
      >
        <h2 id={titleId} className="tile-source-title">
          WHERE THESE NUMBERS COME FROM
        </h2>
        {derived.length > 0 && (
          <section className="tile-source-group">
            <h3 className="tile-source-group-head">DERIVED</h3>
            {derived.map((k) => (
              <Row key={k} p={of(k)} value={values[k]} />
            ))}
          </section>
        )}
        {measured.length > 0 && (
          <section className="tile-source-group">
            <h3 className="tile-source-group-head">MEASURED</h3>
            {measured.map((k) => (
              <Row key={k} p={of(k)} value={values[k]} />
            ))}
          </section>
        )}
        <button
          type="button"
          className="button-l2 tile-source-close"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </SheetShell>
    </>
  );
}
