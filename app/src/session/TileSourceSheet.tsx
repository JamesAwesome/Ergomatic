// GATE 0B ROUND 2 PROTOTYPE — ruling 1's drill-down.
//
// Apple Health's pattern, not Strava's: the figure on the tile carries no
// mark, and the answer lives one level down. That is deliberate. Strava's
// rename ("Power" / "Estimated Power") encodes QUALITY, and our axis does
// not — on a terminated piece the computed 26 is the number the monitor's
// own View Detail screen shows and its reported 52 is the wrong one
// (pm5-interface-notes §27.6), so a mark on the tile face would brand the
// MORE correct number as the less trustworthy one.
//
// Everything here is handed in, already decided. See `tileProvenance.ts`
// for why the sheet performs no lookup of its own.
import { useId, useRef, useState } from "react";
import { SheetShell } from "../components/SheetShell";
import type { MachineTileProvenance, TileProvenance } from "./tileProvenance";

function Row({ p, value }: { p: TileProvenance; value: string }) {
  return (
    <div className="tile-source-row">
      <div className="tile-source-line">
        <span className="tile-source-label">{p.label}</span>
        <span className="tile-source-value">{value}</span>
      </div>
      {p.detail !== undefined && (
        <p className="tile-source-because">{p.detail}</p>
      )}
      {p.because !== undefined && (
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

  const keys = Object.keys(sources) as (keyof MachineTileProvenance)[];
  // Grouped by what each tile's source IS FOR THIS ROW, so the grouping is
  // always true rather than true on average.
  const computed = keys.filter((k) => sources[k].source === "computed");
  const reported = keys.filter((k) => sources[k].source === "reported");

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
      >
        <h2 id={titleId} className="tile-source-title">
          WHERE THESE NUMBERS COME FROM
        </h2>
        {computed.length > 0 && (
          <section className="tile-source-group">
            <h3 className="tile-source-group-head">COMPUTED HERE</h3>
            <p className="tile-source-group-note">
              Worked out on this device, from what the monitor measured.
            </p>
            {computed.map((k) => (
              <Row key={k} p={sources[k]} value={values[k]} />
            ))}
          </section>
        )}
        {reported.length > 0 && (
          <section className="tile-source-group">
            <h3 className="tile-source-group-head">REPORTED BY THE MONITOR</h3>
            <p className="tile-source-group-note">
              The monitor&rsquo;s own figures, as it sent them.
            </p>
            {reported.map((k) => (
              <Row key={k} p={sources[k]} value={values[k]} />
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
